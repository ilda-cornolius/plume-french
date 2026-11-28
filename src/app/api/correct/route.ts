import { NextResponse } from "next/server";
import { z } from "zod";
import { aiConfigured, rewriteToFrench } from "@/lib/ai-rewrite";
import { requirePaidApiCaller } from "@/lib/api-guard";
import { getProviderStatus } from "@/lib/llm";

const bodySchema = z.object({
  text: z.string().max(4000),
});

export async function POST(req: Request) {
  try {
    const gate = await requirePaidApiCaller(req);
    if (!gate.ok) return gate.response;

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const result = await rewriteToFrench(parsed.data.text);
    const status = getProviderStatus();
    return NextResponse.json({
      ...result,
      aiConfigured: aiConfigured(),
      providerStatus: status,
    });
  } catch {
    return NextResponse.json({ error: "Rewrite failed" }, { status: 500 });
  }
}

export async function GET() {
  const status = getProviderStatus();
  return NextResponse.json({
    aiConfigured: status.configured,
    ...status,
    hint: "Set GEMINI_API_KEY from Google AI Studio for full AI rewrites and chat.",
  });
}
