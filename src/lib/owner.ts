import { cookies } from "next/headers";
import { getIdentity } from "../../cursor/identity";
import { auth } from "@/auth";

export const OWNER_COOKIE = "plume_owner";

export type OwnerResolution = {
  ownerId: string;
  /** Set on the response when a new anonymous cookie was minted */
  newOwnerCookie: string | null;
  label: string;
};

/**
 * Resolve who owns conversation data:
 * 1) Cursor app identity (hosted private/team)
 * 2) Google Auth.js session
 * 3) Durable anonymous cookie
 */
export async function resolveOwner(request: Request): Promise<OwnerResolution> {
  const identity = await getIdentity(request);
  if (identity.verified) {
    const label =
      identity.kind === "person"
        ? identity.name || identity.email || "Signed in"
        : identity.name || "API key";
    return {
      ownerId: `cursor:${identity.sub}`,
      newOwnerCookie: null,
      label,
    };
  }

  try {
    const session = await auth();
    if (session?.user?.id) {
      return {
        ownerId: `google:${session.user.id}`,
        newOwnerCookie: null,
        label: session.user.name || session.user.email || "Google",
      };
    }
    if (session?.user?.email) {
      return {
        ownerId: `google:${session.user.email}`,
        newOwnerCookie: null,
        label: session.user.name || session.user.email,
      };
    }
  } catch {
    // auth may be unconfigured
  }

  const jar = await cookies();
  const existing = jar.get(OWNER_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
    return {
      ownerId: `anon:${existing}`,
      newOwnerCookie: null,
      label: "This browser",
    };
  }

  const minted = crypto.randomUUID();
  return {
    ownerId: `anon:${minted}`,
    newOwnerCookie: minted,
    label: "This browser",
  };
}
