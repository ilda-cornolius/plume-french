import { NextResponse } from "next/server";
import { getIdentity } from "../../cursor/identity";
import { resolveOwner, type OwnerResolution } from "@/lib/owner";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function rateLimitOk(key: string): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (cur.count >= MAX_PER_WINDOW) return false;
  cur.count += 1;
  return true;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "private, no-store" } }
  );
}

function tooMany(): NextResponse {
  return NextResponse.json(
    { error: "Too many requests — try again shortly." },
    { status: 429, headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Gate paid LLM routes: require a verified Cursor viewer when hosted,
 * otherwise resolve a local owner; always apply a per-owner rate limit.
 */
export async function requirePaidApiCaller(
  request: Request
): Promise<
  { ok: true; owner: OwnerResolution } | { ok: false; response: NextResponse }
> {
  const hosted = Boolean(process.env.CURSOR_APP_ID?.trim());
  const identity = await getIdentity(request);

  if (hosted && !identity.verified) {
    return { ok: false, response: unauthorized() };
  }

  const owner = await resolveOwner(request);
  if (!rateLimitOk(`llm:${owner.ownerId}`)) {
    return { ok: false, response: tooMany() };
  }

  return { ok: true, owner };
}

/** Reject non-JSON POSTs (basic CSRF hardening for cookie-auth routes). */
export function requireJsonContentType(request: Request): NextResponse | null {
  const ct = request.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    );
  }
  return null;
}
