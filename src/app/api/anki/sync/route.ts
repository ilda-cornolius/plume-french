import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ankiDownloadCollection } from "@/lib/ankiweb";
import { parseAnkiCollection } from "@/lib/anki-parse";
import { DEMO_COLLECTION } from "@/lib/demo-decks";
import {
  COOKIE_NAME,
  decryptSession,
  encryptSession,
  sessionCookieOptions,
  type StoredAnkiSession,
} from "@/lib/session";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const session = token
    ? decryptSession<StoredAnkiSession>(token)
    : null;

  if (!session?.hkey) {
    return NextResponse.json({
      connected: false,
      demo: true,
      username: null,
      collection: DEMO_COLLECTION,
      message:
        "Not connected to AnkiWeb — showing labeled demo decks. Connect to sync your collection.",
    });
  }

  try {
    const { bytes, endpoint } = await ankiDownloadCollection({
      hkey: session.hkey,
      endpoint: session.endpoint,
    });
    const collection = await parseAnkiCollection(bytes);

    const res = NextResponse.json({
      connected: true,
      demo: false,
      username: session.username,
      connectedAt: session.connectedAt,
      collection,
      message: "Synced from AnkiWeb.",
      endpoint,
    });

    // Persist regional endpoint discovered via 303/meta hostNum
    if (endpoint && endpoint !== session.endpoint) {
      const updated: StoredAnkiSession = { ...session, endpoint };
      res.cookies.set(
        COOKIE_NAME,
        encryptSession(updated),
        sessionCookieOptions()
      );
    }
    return res;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AnkiWeb sync failed";
    const safe = message.replace(/password|passwd|hkey/gi, "[redacted]");
    return NextResponse.json({
      connected: true,
      demo: true,
      username: session.username,
      connectedAt: session.connectedAt,
      collection: DEMO_COLLECTION,
      message: `Live sync failed (${safe}). Showing labeled demo data.`,
      error: safe,
    });
  }
}

export async function POST() {
  return GET();
}
