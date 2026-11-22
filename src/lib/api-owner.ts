import { NextResponse } from "next/server";
import { resolveOwner, OWNER_COOKIE, type OwnerResolution } from "@/lib/owner";

export async function withOwner(
  request: Request
): Promise<OwnerResolution> {
  return resolveOwner(request);
}

export function jsonWithOwner(
  body: unknown,
  owner: OwnerResolution,
  init?: { status?: number }
): NextResponse {
  const res = NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { "Cache-Control": "private, no-store" },
  });
  if (owner.newOwnerCookie) {
    res.cookies.set(OWNER_COOKIE, owner.newOwnerCookie, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}
