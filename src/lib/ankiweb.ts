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
const CLIENT_VER = "plume-ankiweb/1.0.0";
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

async function postSync(
  endpoint: string,
  method: string,
  hkey: string,
  obj: Record<string, unknown> | null,
  skey: string,
  redirectDepth = 0
): Promise<{ endpoint: string; body: Buffer }> {
  if (redirectDepth > 5) {
    throw new Error("Too many AnkiWeb redirects");
  }

  const payload = zstdCompressSync(
    Buffer.from(JSON.stringify(obj ?? {}), "utf8")
  );
  const url = `${endpoint.replace(/\/?$/, "/")}sync/${method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "anki-sync": encodeAnkiSyncHeader(hkey, skey),
      "Content-Type": "application/octet-stream",
    },
    body: payload,
    redirect: "manual",
  });

  if (res.status === 308 || res.status === 307) {
    const loc = res.headers.get("location");
    if (!loc) throw new Error("AnkiWeb redirect without location");
    const next = loc.endsWith("/") ? loc : `${loc}/`;
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
  return { endpoint: endpoint.replace(/\/?$/, "/"), body };
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

export async function ankiDownloadCollection(
  auth: AnkiAuth
): Promise<Uint8Array> {
  const skey = sessionKey();
  const { body } = await postSync(auth.endpoint, "download", auth.hkey, {}, skey);

  const magic = body.subarray(0, 15).toString("utf8");
  if (magic.startsWith("SQLite format 3")) {
    return new Uint8Array(body);
  }
  try {
    const again = zstdDecompressSync(body);
    if (again.subarray(0, 15).toString("utf8").startsWith("SQLite format 3")) {
      return new Uint8Array(again);
    }
  } catch {
    // ignore
  }
  throw new Error(
    "Downloaded AnkiWeb payload is not a recognizable collection database"
  );
}

export async function ankiMeta(auth: AnkiAuth): Promise<Record<string, unknown>> {
  const skey = sessionKey();
  const { body } = await postSync(
    auth.endpoint,
    "meta",
    auth.hkey,
    {
      v: SYNC_VER,
      cv: CLIENT_VER,
    },
    skey
  );
  return JSON.parse(body.toString("utf8")) as Record<string, unknown>;
}

/**
 * Full-upload a modified collection.anki2 to AnkiWeb.
 * Caller must download first, mutate locally, then upload — replaces server DB.
 */
export async function ankiUploadCollection(
  auth: AnkiAuth,
  dbBytes: Uint8Array
): Promise<void> {
  const skey = sessionKey();
  const endpoint = auth.endpoint.replace(/\/?$/, "/");
  const url = `${endpoint}sync/upload`;
  const compressed = zstdCompressSync(Buffer.from(dbBytes));
  const hdr = encodeAnkiSyncHeader(auth.hkey, skey);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "anki-sync": hdr,
      "Content-Type": "application/octet-stream",
    },
    body: compressed,
    redirect: "manual",
  });

  if (res.status === 308 || res.status === 307) {
    const loc = res.headers.get("location");
    if (!loc) throw new Error("AnkiWeb upload redirect without location");
    const next = loc.endsWith("/") ? loc : `${loc}/`;
    return ankiUploadCollection({ ...auth, endpoint: next }, dbBytes);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `AnkiWeb upload failed (${res.status})${errText ? `: ${errText.slice(0, 160)}` : ""}`
    );
  }
}
