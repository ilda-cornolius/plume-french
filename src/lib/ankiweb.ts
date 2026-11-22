import zlib from "zlib";

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
const CLIENT_VER = "anki,25.7.5";
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

  // Relative Location
  if (loc.startsWith("/")) {
    const base = new URL(currentEndpoint);
    loc = `${base.origin}${loc}`;
  } else if (!/^https?:\/\//i.test(loc)) {
    loc = new URL(loc, currentEndpoint).toString();
  }

  const u = new URL(loc);
  // Strip /sync/<method> if the redirect pointed at a concrete sync URL
  u.pathname = u.pathname.replace(/\/sync\/[^/]*\/?$/, "/");
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  u.search = "";
  u.hash = "";
  return u.toString();
}

export function endpointFromHostNum(hostNum: number | string | undefined): string | null {
  if (hostNum === undefined || hostNum === null || hostNum === "") return null;
  const n = Number(hostNum);
  if (!Number.isFinite(n) || n <= 0) {
    // hostNum 0 means default sync.ankiweb.net
    return DEFAULT_ENDPOINT;
  }
  return `https://sync${n}.ankiweb.net/`;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "anki-sync": encodeAnkiSyncHeader(hkey, skey),
      "Content-Type": "application/octet-stream",
      Accept: "*/*",
      // Some AnkiWeb frontends behave better with a UA
      "User-Agent": CLIENT_VER,
    },
    body: payload,
    redirect: "manual",
  });

  if (REDIRECT_STATUSES.has(res.status)) {
    const loc = res.headers.get("location") || res.headers.get("Location");
    if (!loc) {
      throw new Error(`AnkiWeb ${method} redirect ${res.status} without Location`);
    }
    const next = normalizeEndpoint(loc, base);
    // Consume body so the connection can close cleanly
    await res.arrayBuffer().catch(() => null);
    return postSync(next, method, hkey, obj, skey, redirectDepth + 1);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `AnkiWeb ${method} failed (${res.status})${errText ? `: ${errText.slice(0, 160)}` : ""}`
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const hasOriginal = res.headers.has("anki-original-size");
  const body = maybeDecompress(buf, hasOriginal);
  return { endpoint: base, body };
}

/**
 * Download can 303 to a one-shot URL; try POST redirect chain first, then GET Location.
 */
async function downloadWithRedirects(
  endpoint: string,
  hkey: string,
  skey: string,
  redirectDepth = 0
): Promise<{ endpoint: string; body: Buffer }> {
  if (redirectDepth > 8) {
    throw new Error("Too many AnkiWeb download redirects");
  }

  const base = endpoint.replace(/\/?$/, "/");
  const payload = zstdCompressSync(Buffer.from("{}", "utf8"));
  const url = `${base}sync/download`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "anki-sync": encodeAnkiSyncHeader(hkey, skey),
      "Content-Type": "application/octet-stream",
      Accept: "*/*",
      "User-Agent": CLIENT_VER,
    },
    body: payload,
    redirect: "manual",
  });

  if (REDIRECT_STATUSES.has(res.status)) {
    const loc = res.headers.get("location") || res.headers.get("Location");
    if (!loc) {
      throw new Error(`AnkiWeb download redirect ${res.status} without Location`);
    }
    await res.arrayBuffer().catch(() => null);

    // 303 See Other often means GET the resource at Location
    if (res.status === 303 || res.status === 302) {
      const absolute = new URL(loc, base).toString();
      // If Location still looks like an Anki sync host root, re-POST there
      if (/\/sync\/?$/i.test(new URL(absolute).pathname) || /sync\d*\.ankiweb\.net\/?$/i.test(absolute.replace(/\/$/, ""))) {
        const next = normalizeEndpoint(loc, base);
        return downloadWithRedirects(next, hkey, skey, redirectDepth + 1);
      }
      // Otherwise GET the one-shot URL
      const getRes = await fetch(absolute, {
        method: "GET",
        headers: {
          Accept: "*/*",
          "User-Agent": CLIENT_VER,
          "anki-sync": encodeAnkiSyncHeader(hkey, skey),
        },
        redirect: "follow",
      });
      if (!getRes.ok) {
        // Fall back: treat Location as new sync endpoint and POST download again
        const next = normalizeEndpoint(loc, base);
        return downloadWithRedirects(next, hkey, skey, redirectDepth + 1);
      }
      const buf = Buffer.from(await getRes.arrayBuffer());
      const hasOriginal = getRes.headers.has("anki-original-size");
      return { endpoint: base, body: maybeDecompress(buf, hasOriginal) };
    }

    const next = normalizeEndpoint(loc, base);
    return downloadWithRedirects(next, hkey, skey, redirectDepth + 1);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `AnkiWeb download failed (${res.status})${errText ? `: ${errText.slice(0, 160)}` : ""}`
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const hasOriginal = res.headers.has("anki-original-size");
  return { endpoint: base, body: maybeDecompress(buf, hasOriginal) };
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

  // Prefer explicit new endpoint / host number from meta
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
  // Resolve regional host via meta first (updates endpoint for hostNum / redirects)
  let endpoint = auth.endpoint;
  try {
    const { endpoint: ep } = await ankiMeta(auth);
    endpoint = ep;
  } catch {
    // meta can fail on empty collections; still try download
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

/**
 * Full-upload a modified collection.anki2 to AnkiWeb.
 * Caller must download first, mutate locally, then upload — replaces server DB.
 */
export async function ankiUploadCollection(
  auth: AnkiAuth,
  dbBytes: Uint8Array
): Promise<string> {
  const skey = sessionKey();
  let endpoint = auth.endpoint.replace(/\/?$/, "/");
  let depth = 0;

  // Prefer regional host
  try {
    const { endpoint: ep } = await ankiMeta(auth);
    endpoint = ep.replace(/\/?$/, "/");
  } catch {
    // continue with existing endpoint
  }

  while (depth < 8) {
    const url = `${endpoint}sync/upload`;
    const compressed = zstdCompressSync(Buffer.from(dbBytes));
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "anki-sync": encodeAnkiSyncHeader(auth.hkey, skey),
        "Content-Type": "application/octet-stream",
        Accept: "*/*",
        "User-Agent": CLIENT_VER,
      },
      body: compressed,
      redirect: "manual",
    });

    if (REDIRECT_STATUSES.has(res.status)) {
      const loc = res.headers.get("location") || res.headers.get("Location");
      if (!loc) throw new Error("AnkiWeb upload redirect without location");
      await res.arrayBuffer().catch(() => null);
      endpoint = normalizeEndpoint(loc, endpoint);
      depth += 1;
      continue;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `AnkiWeb upload failed (${res.status})${errText ? `: ${errText.slice(0, 160)}` : ""}`
      );
    }
    return endpoint;
  }

  throw new Error("Too many AnkiWeb upload redirects");
}
