import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { AnkiAuth } from "./ankiweb";

const COOKIE_NAME = "plume_anki_session";

function secretKey(): Buffer {
  const raw =
    process.env.PLUME_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    "plume-local-dev-only-change-me";
  return createHash("sha256").update(raw).digest();
}

export function encryptSession(payload: object): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSession<T>(token: string): T | null {
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(dec.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export type StoredAnkiSession = AnkiAuth & {
  username: string;
  connectedAt: string;
};

export { COOKIE_NAME };

export function sessionCookieOptions(maxAgeSec = 60 * 60 * 24 * 14) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
