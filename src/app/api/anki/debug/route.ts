import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  decryptSession,
  type StoredAnkiSession,
} from "@/lib/session";
import { debugAnkiDownload } from "@/lib/ankiweb";

/** Local-only diagnostic — disabled on the hosted app / production. */
export async function GET() {
  if (process.env.NODE_ENV === "production" || process.env.CURSOR_APP_ID) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const session = token
    ? decryptSession<StoredAnkiSession>(token)
    : null;

  if (!session?.hkey) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const auth = { hkey: session.hkey, endpoint: session.endpoint };
  const download = await debugAnkiDownload(auth);

  return NextResponse.json({
    username: session.username,
    savedEndpoint: session.endpoint,
    clientVer: download.clientVer,
    resolvedEndpoint: download.resolvedEndpoint,
    meta: download.meta
      ? {
          keys: Object.keys(download.meta),
          hostNum: download.meta.hostNum ?? download.meta.host_number ?? null,
          cont: download.meta.cont ?? null,
          msg:
            typeof download.meta.msg === "string"
              ? download.meta.msg.slice(0, 200)
              : null,
          empty: download.meta.empty ?? null,
        }
      : null,
    metaError: download.metaError,
    probes: download.probes,
  });
}
