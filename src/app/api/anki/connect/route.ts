import { NextResponse } from "next/server";
import { z } from "zod";
import { ankiLogin, ankiMeta } from "@/lib/ankiweb";
import {
  COOKIE_NAME,
  encryptSession,
  sessionCookieOptions,
  type StoredAnkiSession,
} from "@/lib/session";

const bodySchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    const { username, password } = parsed.data;
    // Intentionally never log username/password or auth payloads
    let auth = await ankiLogin(username, password);

    // Resolve regional host (303/hostNum) and persist that endpoint
    try {
      const { endpoint } = await ankiMeta(auth);
      auth = { ...auth, endpoint };
    } catch {
      // meta can fail on empty collections; hostKey success is enough to connect
    }

    const session: StoredAnkiSession = {
      ...auth,
      username,
      connectedAt: new Date().toISOString(),
    };

    const token = encryptSession(session);
    const res = NextResponse.json({
      ok: true,
      username,
      connectedAt: session.connectedAt,
      endpoint: session.endpoint,
    });
    res.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
    return res;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not connect to AnkiWeb";
    const safe = message.replace(/password|passwd|hkey/gi, "[redacted]");
    return NextResponse.json({ error: safe }, { status: 401 });
  }
}
