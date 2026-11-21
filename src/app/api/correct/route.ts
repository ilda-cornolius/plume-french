import { NextResponse } from "next/server";
import { z } from "zod";
import { aiConfigured, rewriteToFrench } from "@/lib/ai-rewrite";

const bodySchema = z.object({
  text: z.string().max(4000),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const result = await rewriteToFrench(parsed.data.text);
    return NextResponse.json({
      ...result,
      aiConfigured: aiConfigured(),
    });
  } catch {
    return NextResponse.json({ error: "Rewrite failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    aiConfigured: aiConfigured(),
    engines: ["openai (OPENAI_API_KEY)", "local-ai (Franglais heuristics)"],
  });
}
