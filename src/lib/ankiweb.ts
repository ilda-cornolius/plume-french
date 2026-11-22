import zlib from "zlib";
import { pickLocation, rawRequest } from "@/lib/anki-http";

const zstdCompressSync = (
  zlib as typeof zlib & {
    zstdCompressSync: (buf: Buffer) => Buffer;
  }
).zstdCompressSync;

const zstdDecompressSync = (
  zlib as typeof zlib & {
    zstdDecompressSync: (buf: Buffer) => Buffer;
  }
).zstdDecompressSync;

/** Protocol 11 (zstd + anki-sync header). Multipart fallback uses v10. */
const SYNC_VER = 11;
/** Matches Anki / fastanki shape: anki,<version> (<tag>),<platform> */
const CLIENT_VER = "anki,25.07.5 (plume),linux";
const DEFAULT_ENDPOINT = "https://sync.ankiweb.net/";

export type AnkiAuth = {
  hkey: string;
  endpoint: string;
};

export type AnkiDeckSummary = {
  id: string;
  name: string;
  cardCount: number;
};

export type AnkiNoteSummary = {
  id: number;
  deckName: string;
  fields: string[];
  tags: string[];
};

export type AnkiCollectionData = {
  decks: AnkiDeckSummary[];
  notes: AnkiNoteSummary[];
  syncedAt: string;
};

export type AnkiDebugProbe = {
  endpointTried: string;
  method: string;
  transport: "zstd" | "multipart";
  status: number;
  headerNames: string[];
  location: string | null;
  bodyPreview: string;
  bodyLen: number;
  hasOriginalSize: boolean;
};

function sessionKey(): string {
  // Same shape as fastanki / Anki simple_session_id (32-bit → short id)
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}

function encodeAnkiSyncHeader(hkey: string, skey: string, ver = SYNC_VER): string {
  return JSON.stringify({ v: ver, k: hkey, c: CLIENT_VER, s: skey });
}

function maybeDecompressZstd(buf: Buffer, hasOriginalSize: boolean): Buffer {
  if (!hasOriginalSize) return buf;
  try {
    return zstdDecompressSync(buf);
  } catch {
    return buf;
  }
}

/** Turn a Location header into an Anki sync endpoint base ending with /. */
export function normalizeEndpoint(location: string, currentEndpoint: string): string {
  let loc = location.trim();
  if (!loc) throw new Error("AnkiWeb redirect without location");

  if (loc.startsWith("/")) {
    const base = new URL(currentEndpoint);
    loc = `${base.origin}${loc}`;
  } else if (!/^https?:\/\//i.test(loc)) {
    loc = new URL(loc, currentEndpoint).toString();
  }

  const u = new URL(loc);
  u.pathname = u.pathname.replace(/\/sync\/[^/]*\/?$/, "/");
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  u.search = "";
  u.hash = "";
  return u.toString();
}

export function endpointFromHostNum(hostNum: number | string | undefined): string | null {
  if (hostNum === undefined || hostNum === null || hostNum === "") return null;
  const n = Number(hostNum);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ENDPOINT;
  return `https://sync${n}.ankiweb.net/`;
}

/**
 * Official open-source Anki follows HTTP 308. AnkiWeb production also returns
 * 303 + Location for regional host routing — follow both when Location is set.
 */
const HOST_REDIRECT_STATUSES = new Set([303, 308]);

function candidateEndpoints(preferred: string): string[] {
  const list = [
    preferred.replace(/\/?$/, "/"),
    DEFAULT_ENDPOINT,
    ...Array.from({ length: 12 }, (_, i) => `https://sync${i + 1}.ankiweb.net/`),
  ];
  return [...new Set(list)];
}

function describeStatus(status: number, body: Buffer, location: string | null): string {
  const preview = body.toString("utf8").slice(0, 80).replace(/\s+/g, " ");
  if (status === 303) {
    return (
      `AnkiWeb returned HTTP 303 (app error, not a host redirect` +
      `${location ? `; Location=${location}` : "; no Location"}` +
      `${preview ? `; body=${preview}` : ""}). ` +
      `This usually means the sync request was rejected or the connection was interrupted.`
    );
  }
  return `AnkiWeb HTTP ${status}${preview ? `: ${preview}` : ""}`;
}

function buildMultipart(fields: Record<string, string | Buffer>): {
  body: Buffer;
  contentType: string;
} {
  const boundary = `----PlumeAnki${Date.now().toString(16)}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`
      )
    );
    chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * One AnkiWeb sync session — stable skey for the lifetime of the client,
 * matching HttpSyncClient / fastanki SyncServer.
 */
export class SyncClient {
  hkey: string;
  endpoint: string;
  readonly skey: string;

  constructor(auth: AnkiAuth, skey = sessionKey()) {
    this.hkey = auth.hkey;
    this.endpoint = auth.endpoint.replace(/\/?$/, "/") || DEFAULT_ENDPOINT;
    this.skey = skey;
  }

  toAuth(): AnkiAuth {
    return { hkey: this.hkey, endpoint: this.endpoint };
  }

  private async postZstd(
    method: string,
    payload: Buffer,
    redirectDepth = 0
  ): Promise<{ body: Buffer; hasOriginalSize: boolean; status: number }> {
    if (redirectDepth > 8) throw new Error("Too many AnkiWeb 308 redirects");

    const base = this.endpoint.replace(/\/?$/, "/");
    const url = `${base}sync/${method}`;
    const res = await rawRequest(url, {
      method: "POST",
      headers: {
        "anki-sync": encodeAnkiSyncHeader(this.hkey, this.skey, SYNC_VER),
        "Content-Type": "application/octet-stream",
        Accept: "*/*",
        "User-Agent": CLIENT_VER,
      },
      body: payload,
      timeoutMs: 120_000,
    });

    if (HOST_REDIRECT_STATUSES.has(res.status)) {
      const loc = pickLocation(res.headers);
      if (loc) {
        this.endpoint = normalizeEndpoint(loc, base);
        return this.postZstd(method, payload, redirectDepth + 1);
      }
      // Bare 303/308 without Location is an app error (body often echoes the code)
      throw new Error(describeStatus(res.status, res.body, null));
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(describeStatus(res.status, res.body, pickLocation(res.headers)));
    }

    return {
      body: maybeDecompressZstd(res.body, "anki-original-size" in res.headers),
      hasOriginalSize: "anki-original-size" in res.headers,
      status: res.status,
    };
  }

  private async postMultipart(
    method: string,
    jsonObj: Record<string, unknown> | null,
    rawData?: Buffer,
    opts: { includeSession?: boolean } = {}
  ): Promise<{ body: Buffer; status: number }> {
    const base = this.endpoint.replace(/\/?$/, "/");
    const url = `${base}sync/${method}`;
    const includeSession = opts.includeSession !== false;

    // Legacy FullSyncer download: postVars = { k, v } only (no s, no data).
    // Meta/other: { k, s } + gzip JSON data. Upload: { k, v } + file data.
    const fields: Record<string, string | Buffer> = {
      k: this.hkey,
    };
    if (includeSession) {
      fields.s = this.skey;
    }

    if (method === "download" && jsonObj == null && rawData === undefined) {
      // Match Anki desktop FullSyncer.download / AnkiDroid: no data field
      fields.v = CLIENT_VER;
      fields.c = "0";
    } else if (rawData) {
      fields.v = CLIENT_VER;
      fields.c = "1";
      fields.data = zlib.gzipSync(rawData);
    } else {
      fields.c = "1";
      fields.data = zlib.gzipSync(
        Buffer.from(JSON.stringify(jsonObj ?? {}), "utf8")
      );
    }

    const { body, contentType } = buildMultipart(fields);
    const res = await rawRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Accept: "*/*",
        "User-Agent": CLIENT_VER,
      },
      body,
      timeoutMs: 120_000,
    });

    if (HOST_REDIRECT_STATUSES.has(res.status)) {
      const loc = pickLocation(res.headers);
      if (loc) {
        this.endpoint = normalizeEndpoint(loc, base);
        return this.postMultipart(method, jsonObj, rawData, opts);
      }
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        `multipart ${describeStatus(res.status, res.body, pickLocation(res.headers))}`
      );
    }

    // Legacy responses are uncompressed bytes (sqlite or JSON)
    return { body: res.body, status: res.status };
  }

  async json(
    method: string,
    obj: Record<string, unknown> | null = null
  ): Promise<Record<string, unknown>> {
    const payload = zstdCompressSync(
      Buffer.from(JSON.stringify(obj ?? {}), "utf8")
    );
    try {
      const { body } = await this.postZstd(method, payload);
      return JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    } catch (zstdErr) {
      // Fall back to multipart v10 for stubborn AnkiWeb edges
      try {
        const { body } = await this.postMultipart(method, obj);
        return JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      } catch {
        throw zstdErr;
      }
    }
  }

  async downloadBytes(): Promise<Buffer> {
    const payload = zstdCompressSync(Buffer.from("{}", "utf8"));
    const errors: string[] = [];

    // 1) zstd on current endpoint (follows 308)
    try {
      const { body } = await this.postZstd("download", payload);
      return ensureSqlite(body);
    } catch (e) {
      errors.push(`zstd@${this.endpoint}: ${e instanceof Error ? e.message : "err"}`);
    }

    // 2) multipart download — FullSyncer style (k+v, no s) then with s
    for (const includeSession of [false, true]) {
      try {
        const { body } = await this.postMultipart("download", null, undefined, {
          includeSession,
        });
        if (body.toString("utf8") === "upgradeRequired") {
          throw new Error("AnkiWeb requires a newer client (upgradeRequired)");
        }
        return ensureSqlite(body);
      } catch (e) {
        errors.push(
          `multipart(s=${includeSession})@${this.endpoint}: ${shortErr(e)}`
        );
      }
    }

    // 3) Probe regional hosts with both transports (hostNum may be stale)
    for (const ep of candidateEndpoints(this.endpoint)) {
      if (ep === this.endpoint) continue;
      const prev = this.endpoint;
      this.endpoint = ep;
      try {
        const { body } = await this.postZstd("download", payload);
        return ensureSqlite(body);
      } catch (e) {
        errors.push(`zstd@${ep}: ${shortErr(e)}`);
      }
      try {
        const { body } = await this.postMultipart("download", null, undefined, {
          includeSession: false,
        });
        if (body.toString("utf8") === "upgradeRequired") {
          throw new Error("AnkiWeb requires a newer client (upgradeRequired)");
        }
        return ensureSqlite(body);
      } catch (e) {
        errors.push(`multipart@${ep}: ${shortErr(e)}`);
      }
      this.endpoint = prev;
    }

    throw new Error(
      `AnkiWeb download failed after zstd+multipart probes. ${errors.slice(0, 6).join(" | ")}`
    );
  }

  async uploadBytes(dbBytes: Uint8Array): Promise<void> {
    const compressed = zstdCompressSync(Buffer.from(dbBytes));
    try {
      await this.postZstd("upload", compressed);
      return;
    } catch (zstdErr) {
      try {
        await this.postMultipart("upload", null, Buffer.from(dbBytes));
        return;
      } catch {
        throw zstdErr;
      }
    }
  }

  /** meta + 308/hostNum resolution (mutates this.endpoint). */
  async meta(): Promise<Record<string, unknown>> {
    const meta = await this.json("meta", {
      v: SYNC_VER,
      cv: CLIENT_VER,
    });

    const newEp =
      (typeof meta.new_endpoint === "string" && meta.new_endpoint) ||
      (typeof meta.endpoint === "string" && meta.endpoint) ||
      null;
    if (newEp) {
      this.endpoint = normalizeEndpoint(newEp, this.endpoint);
    } else if (meta.hostNum !== undefined || meta.host_number !== undefined) {
      const fromHost = endpointFromHostNum(
        (meta.hostNum ?? meta.host_number) as number | string
      );
      if (fromHost) this.endpoint = fromHost;
    }
    return meta;
  }
}

function shortErr(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 100) : "err";
}

function ensureSqlite(body: Buffer): Buffer {
  const magic = body.subarray(0, 15).toString("utf8");
  if (magic.startsWith("SQLite format 3")) return body;
  try {
    const again = zstdDecompressSync(body);
    if (again.subarray(0, 15).toString("utf8").startsWith("SQLite format 3")) {
      return again;
    }
  } catch {
    // ignore
  }
  // gzip (multipart path)
  try {
    const gz = zlib.gunzipSync(body);
    if (gz.subarray(0, 15).toString("utf8").startsWith("SQLite format 3")) {
      return gz;
    }
  } catch {
    // ignore
  }
  throw new Error(
    "Downloaded AnkiWeb payload is not a recognizable collection database"
  );
}

export async function ankiLogin(
  username: string,
  password: string,
  endpoint = DEFAULT_ENDPOINT
): Promise<AnkiAuth> {
  const client = new SyncClient({ hkey: "", endpoint });
  const parsed = await client.json("hostKey", { u: username, p: password });
  if (typeof parsed.key !== "string" || !parsed.key) {
    throw new Error("AnkiWeb login failed: no host key returned");
  }
  client.hkey = parsed.key;
  // Resolve regional host while skey is still this session
  try {
    await client.meta();
  } catch {
    // meta can fail on some accounts; hostKey is enough to connect
  }
  return client.toAuth();
}

export async function ankiMeta(
  auth: AnkiAuth
): Promise<{ meta: Record<string, unknown>; endpoint: string }> {
  const client = new SyncClient(auth);
  const meta = await client.meta();
  return { meta, endpoint: client.endpoint };
}

export async function ankiDownloadCollection(
  auth: AnkiAuth
): Promise<{ bytes: Uint8Array; endpoint: string }> {
  const client = new SyncClient(auth);
  try {
    await client.meta();
  } catch {
    // still attempt download / host probe
  }
  const body = await client.downloadBytes();
  return { bytes: new Uint8Array(body), endpoint: client.endpoint };
}

export async function ankiUploadCollection(
  auth: AnkiAuth,
  dbBytes: Uint8Array
): Promise<string> {
  const client = new SyncClient(auth);
  try {
    await client.meta();
  } catch {
    // continue
  }
  await client.uploadBytes(dbBytes);
  return client.endpoint;
}

/**
 * Non-destructive probe for /api/anki/debug — never returns hkey.
 * Tries meta + one download attempt per transport on the saved endpoint and first regional.
 */
export async function debugAnkiDownload(auth: AnkiAuth): Promise<{
  skey: string;
  clientVer: string;
  probes: AnkiDebugProbe[];
  meta: Record<string, unknown> | null;
  metaError: string | null;
  resolvedEndpoint: string;
}> {
  const client = new SyncClient(auth);
  const probes: AnkiDebugProbe[] = [];

  let meta: Record<string, unknown> | null = null;
  let metaError: string | null = null;
  try {
    meta = await client.meta();
  } catch (e) {
    metaError = e instanceof Error ? e.message : "meta failed";
  }

  const endpoints = [...new Set([client.endpoint, ...candidateEndpoints(client.endpoint)])].slice(
    0,
    4
  );

  for (const ep of endpoints) {
    for (const transport of ["zstd", "multipart"] as const) {
      const base = ep.replace(/\/?$/, "/");
      const url = `${base}sync/download`;
      try {
        let res;
        if (transport === "zstd") {
          const payload = zstdCompressSync(Buffer.from("{}", "utf8"));
          res = await rawRequest(url, {
            method: "POST",
            headers: {
              "anki-sync": encodeAnkiSyncHeader(auth.hkey, client.skey, SYNC_VER),
              "Content-Type": "application/octet-stream",
              Accept: "*/*",
              "User-Agent": CLIENT_VER,
            },
            body: payload,
            timeoutMs: 60_000,
          });
        } else {
          const { body, contentType } = buildMultipart({
            k: auth.hkey,
            v: CLIENT_VER,
            c: "0",
          });
          res = await rawRequest(url, {
            method: "POST",
            headers: {
              "Content-Type": contentType,
              Accept: "*/*",
              "User-Agent": CLIENT_VER,
            },
            body,
            timeoutMs: 60_000,
          });
        }
        probes.push({
          endpointTried: base,
          method: "download",
          transport,
          status: res.status,
          headerNames: res.headerNames,
          location: pickLocation(res.headers),
          bodyPreview: res.body.toString("utf8").slice(0, 60),
          bodyLen: res.body.length,
          hasOriginalSize: "anki-original-size" in res.headers,
        });
      } catch (e) {
        probes.push({
          endpointTried: base,
          method: "download",
          transport,
          status: 0,
          headerNames: [],
          location: null,
          bodyPreview: e instanceof Error ? e.message.slice(0, 60) : "err",
          bodyLen: 0,
          hasOriginalSize: false,
        });
      }
    }
  }

  return {
    skey: client.skey,
    clientVer: CLIENT_VER,
    probes,
    meta,
    metaError,
    resolvedEndpoint: client.endpoint,
  };
}
