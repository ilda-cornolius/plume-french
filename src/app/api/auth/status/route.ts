import { NextResponse } from "next/server";
import { auth, googleConfigured } from "@/auth";

export async function GET() {
  const session = await auth();
  return NextResponse.json({
    googleConfigured,
    signedIn: Boolean(session?.user),
    user: session?.user
      ? {
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }
      : null,
  });
}
