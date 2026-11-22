import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  decryptSession,
  type StoredAnkiSession,
} from "@/lib/session";

/** Lightweight session check — does not call AnkiWeb. */
export async function GET() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const session = token
    ? decryptSession<StoredAnkiSession>(token)
    : null;

  if (!session?.hkey || !session.username) {
    return NextResponse.json({
      connected: false,
      username: null,
      connectedAt: null,
      endpoint: null,
    });
  }

  return NextResponse.json({
    connected: true,
    username: session.username,
    connectedAt: session.connectedAt,
    endpoint: session.endpoint,
  });
}
