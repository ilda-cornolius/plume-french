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

const SYNC_VER = 11;
const CLIENT_VER = "anki,25.07.5";
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

function sessionKey(): string {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}

function encodeAnkiSyncHeader(hkey: string, skey: string): string {
  return JSON.stringify({ v: SYNC_VER, k: hkey, c: CLIENT_VER, s: skey });
}

function maybeDecompress(buf: Buffer, hasOriginalSize: boolean): Buffer {
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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function candidateEndpoints(preferred: string): string[] {
  const list = [
    preferred.replace(/\/?$/, "/"),
    DEFAULT_ENDPOINT,
    ...Array.from({ length: 12 }, (_, i) => `https://sync${i + 1}.ankiweb.net/`),
  ];
  return [...new Set(list)];
}

async function postSync(
  endpoint: string,
  method: string,
  hkey: string,
  obj: Record<string, unknown> | null,
  skey: string,
  redirectDepth = 0
): Promise<{ endpoint: string; body: Buffer }> {
  if (redirectDepth > 8) {
    throw new Error("Too many AnkiWeb redirects");
  }

  const base = endpoint.replace(/\/?$/, "/");
  const payload = zstdCompressSync(
    Buffer.from(JSON.stringify(obj ?? {}), "utf8")
  );
  const url = `${base}sync/${method}`;

  const res = await rawRequest(url, {
    method: "POST",
    headers: {
      "anki-sync": encodeAnkiSyncHeader(hkey, skey),
      "Content-Type": "application/octet-stream",
      Accept: "*/*",
      "User-Agent": CLIENT_VER,
    },
    body: payload,
  });

  if (REDIRECT_STATUSES.has(res.status)) {
    const loc = pickLocation(res.headers);
    if (!loc) {
      // No Location — try known regional hosts (common when front door returns bare 303)
      if (redirectDepth === 0) {
        for (const ep of candidateEndpoints(base)) {
          if (ep === base) continue;
          try {
            return await postSync(ep, method, hkey, obj, skey, redirectDepth + 1);
          } catch {
            // try next host
          }
        }
      }
      throw new Error(
        `AnkiWeb ${method} redirect ${res.status} without Location (headers: ${res.headerNames.join(", ") || "none"})`
      );
    }
    const next = normalizeEndpoint(loc, base);
    return postSync(next, method, hkey, obj, skey, redirectDepth + 1);
  }

  if (res.status < 200 || res.status >= 300) {
    const errText = res.body.toString("utf8").slice(0, 160);
    throw new Error(
      `AnkiWeb ${method} failed (${res.status})${errText ? `: ${errText}` : ""}`
    );
  }

  const hasOriginal = "anki-original-size" in res.headers;
  const body = maybeDecompress(res.body, hasOriginal);
  return { endpoint: base, body };
}

async function downloadOnce(
  endpoint: string,
  hkey: string,
  skey: string
): Promise<{
  endpoint: string;
  body: Buffer;
  status: number;
  headerNames: string[];
  location: string | null;
  hasOriginalSize: boolean;
}> {
  const base = endpoint.replace(/\/?$/, "/");
  const payload = zstdCompressSync(Buffer.from("{}", "utf8"));
  const url = `${base}sync/download`;
  const res = await rawRequest(url, {
    method: "POST",
    headers: {
      "anki-sync": encodeAnkiSyncHeader(hkey, skey),
      "Content-Type": "application/octet-stream",
      Accept: "*/*",
      "User-Agent": CLIENT_VER,
    },
    body: payload,
  });
  return {
    endpoint: base,
    body: res.body,
    status: res.status,
    headerNames: res.headerNames,
    location: pickLocation(res.headers),
    hasOriginalSize: "anki-original-size" in res.headers,
  };
}

function decodeDownloadBody(body: Buffer, hasOriginalSize: boolean): Buffer {
  const decompressed = maybeDecompress(body, hasOriginalSize);
  const magic = decompressed.subarray(0, 15).toString("utf8");
  if (magic.startsWith("SQLite format 3")) return decompressed;
  if (!hasOriginalSize) {
    try {
      const again = zstdDecompressSync(body);
      if (again.subarray(0, 15).toString("utf8").startsWith("SQLite format 3")) {
        return again;
      }
    } catch {
      // keep
    }
  }
  return decompressed;
}

/**
 * Full collection download with redirect + regional host fallback.
 */
async function downloadWithRedirects(
  endpoint: string,
  hkey: string,
  skey: string,
  redirectDepth = 0
): Promise<{ endpoint: string; body: Buffer }> {
  if (redirectDepth > 10) {
    throw new Error("Too many AnkiWeb download redirects");
  }

  const first = await downloadOnce(endpoint, hkey, skey);

  if (REDIRECT_STATUSES.has(first.status)) {
    if (first.location) {
      const absolute = new URL(first.location, first.endpoint).toString();
      const path = new URL(absolute).pathname;
      // One-shot file URL → GET; sync host → re-POST
      if (!/\/sync(\/|$)/i.test(path)) {
        const getRes = await rawRequest(absolute, {
          method: "GET",
          headers: {
            Accept: "*/*",
            "User-Agent": CLIENT_VER,
            "anki-sync": encodeAnkiSyncHeader(hkey, skey),
          },
        });
        if (getRes.status >= 200 && getRes.status < 300) {
          return {
            endpoint: first.endpoint,
            body: decodeDownloadBody(
              getRes.body,
              "anki-original-size" in getRes.headers
            ),
          };
        }
      }
      const next = normalizeEndpoint(first.location, first.endpoint);
      return downloadWithRedirects(next, hkey, skey, redirectDepth + 1);
    }

    // Bare 303/302 with no Location — probe regional sync hosts
    const errors: string[] = [
      `${first.endpoint}→${first.status}(no Location; headers: ${first.headerNames.join("|") || "none"})`,
    ];
    for (const ep of candidateEndpoints(first.endpoint)) {
      if (ep === first.endpoint) continue;
      try {
        const attempt = await downloadOnce(ep, hkey, skey);
        if (REDIRECT_STATUSES.has(attempt.status)) {
          if (attempt.location) {
            const next = normalizeEndpoint(attempt.location, ep);
            return downloadWithRedirects(next, hkey, skey, redirectDepth + 1);
          }
          errors.push(`${ep}→${attempt.status}(no Location)`);
          continue;
        }
        if (attempt.status >= 200 && attempt.status < 300) {
          return {
            endpoint: ep,
            body: decodeDownloadBody(attempt.body, attempt.hasOriginalSize),
          };
        }
        errors.push(`${ep}→${attempt.status}`);
      } catch (e) {
        errors.push(
          `${ep}→${e instanceof Error ? e.message.slice(0, 40) : "err"}`
        );
      }
    }
    throw new Error(
      `AnkiWeb download redirect ${first.status} without Location; tried: ${errors.slice(0, 8).join("; ")}`
    );
  }

  if (first.status < 200 || first.status >= 300) {
    const errText = first.body.toString("utf8").slice(0, 160);
    if (redirectDepth === 0) {
      for (const ep of candidateEndpoints(first.endpoint)) {
        if (ep === first.endpoint) continue;
        try {
          return await downloadWithRedirects(ep, hkey, skey, redirectDepth + 1);
        } catch {
          // continue
        }
      }
    }
    throw new Error(
      `AnkiWeb download failed (${first.status})${errText ? `: ${errText}` : ""}`
    );
  }

  return {
    endpoint: first.endpoint,
    body: decodeDownloadBody(first.body, first.hasOriginalSize),
  };
}

export async function ankiLogin(
  username: string,
  password: string,
  endpoint = DEFAULT_ENDPOINT
): Promise<AnkiAuth> {
  const skey = sessionKey();
  const { endpoint: ep, body } = await postSync(
    endpoint,
    "hostKey",
    "",
    { u: username, p: password },
    skey
  );
  const parsed = JSON.parse(body.toString("utf8")) as { key?: string };
  if (!parsed.key) {
    throw new Error("AnkiWeb login failed: no host key returned");
  }
  return { hkey: parsed.key, endpoint: ep };
}

export async function ankiMeta(
  auth: AnkiAuth
): Promise<{ meta: Record<string, unknown>; endpoint: string }> {
  const skey = sessionKey();
  const { endpoint, body } = await postSync(
    auth.endpoint,
    "meta",
    auth.hkey,
    {
      v: SYNC_VER,
      cv: CLIENT_VER,
    },
    skey
  );
  const meta = JSON.parse(body.toString("utf8")) as Record<string, unknown>;

  let resolved = endpoint;
  const newEp =
    (typeof meta.new_endpoint === "string" && meta.new_endpoint) ||
    (typeof meta.endpoint === "string" && meta.endpoint) ||
    null;
  if (newEp) {
    resolved = normalizeEndpoint(newEp, endpoint);
  } else if (meta.hostNum !== undefined || meta.host_number !== undefined) {
    const fromHost = endpointFromHostNum(
      (meta.hostNum ?? meta.host_number) as number | string
    );
    if (fromHost) resolved = fromHost;
  }

  return { meta, endpoint: resolved };
}

export async function ankiDownloadCollection(
  auth: AnkiAuth
): Promise<{ bytes: Uint8Array; endpoint: string }> {
  let endpoint = auth.endpoint;
  try {
    const { endpoint: ep } = await ankiMeta(auth);
    endpoint = ep;
  } catch {
    // meta can fail; still try download / host probe
  }

  const skey = sessionKey();
  const { endpoint: finalEp, body } = await downloadWithRedirects(
    endpoint,
    auth.hkey,
    skey
  );

  const magic = body.subarray(0, 15).toString("utf8");
  if (magic.startsWith("SQLite format 3")) {
    return { bytes: new Uint8Array(body), endpoint: finalEp };
  }
  try {
    const again = zstdDecompressSync(body);
    if (again.subarray(0, 15).toString("utf8").startsWith("SQLite format 3")) {
      return { bytes: new Uint8Array(again), endpoint: finalEp };
    }
  } catch {
    // ignore
  }
  throw new Error(
    "Downloaded AnkiWeb payload is not a recognizable collection database"
  );
}

export async function ankiUploadCollection(
  auth: AnkiAuth,
  dbBytes: Uint8Array
): Promise<string> {
  const skey = sessionKey();
  let endpoint = auth.endpoint.replace(/\/?$/, "/");
  let depth = 0;

  try {
    const { endpoint: ep } = await ankiMeta(auth);
    endpoint = ep.replace(/\/?$/, "/");
  } catch {
    // continue
  }

  while (depth < 8) {
    const url = `${endpoint}sync/upload`;
    const compressed = zstdCompressSync(Buffer.from(dbBytes));
    const res = await rawRequest(url, {
      method: "POST",
      headers: {
        "anki-sync": encodeAnkiSyncHeader(auth.hkey, skey),
        "Content-Type": "application/octet-stream",
        Accept: "*/*",
        "User-Agent": CLIENT_VER,
      },
      body: compressed,
    });

    if (REDIRECT_STATUSES.has(res.status)) {
      const loc = pickLocation(res.headers);
      if (!loc) {
        // probe regionals
        let advanced = false;
        for (const ep of candidateEndpoints(endpoint)) {
          if (ep === endpoint) continue;
          endpoint = ep;
          advanced = true;
          break;
        }
        if (!advanced) {
          throw new Error(
            `AnkiWeb upload redirect ${res.status} without Location (headers: ${res.headerNames.join(", ") || "none"})`
          );
        }
        depth += 1;
        continue;
      }
      endpoint = normalizeEndpoint(loc, endpoint);
      depth += 1;
      continue;
    }

    if (res.status < 200 || res.status >= 300) {
      const errText = res.body.toString("utf8").slice(0, 160);
      throw new Error(
        `AnkiWeb upload failed (${res.status})${errText ? `: ${errText}` : ""}`
      );
    }
    return endpoint;
  }

  throw new Error("Too many AnkiWeb upload redirects");
}
