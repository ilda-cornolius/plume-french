import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePaidApiCaller } from "@/lib/api-guard";
import { chatCompletion, getProviderStatus } from "@/lib/llm";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
});

const SYSTEM = `You are Plume, a friendly French conversation partner for learners.
- Prefer French; keep replies short (1–3 sentences) at A2–B1 level unless the learner writes more advanced French.
- If they mix English, gently reply in correct French and include a brief English gloss in parentheses when helpful.
- Light corrections: if they make a clear mistake, show the fixed form once in italics-style quotes, then continue the chat.
- Stay warm and encouraging. Ask one follow-up question to keep the conversation going.
- Topics: daily life, travel, food, hobbies, feelings — nothing medical/legal/dangerous.`;

const LOCAL_REPLIES = [
  "Bonjour ! Comment ça va aujourd'hui ? (How are you today?)",
  "Très bien ! Qu'est-ce que tu aimes faire le week-end ?",
  "Moi, j'adore parler français avec toi. Tu veux un café ?",
  "Super ! Dis-moi : tu préfères la ville ou la campagne ?",
];

export async function GET() {
  return NextResponse.json(getProviderStatus());
}

export async function POST(req: Request) {
  try {
    const gate = await requirePaidApiCaller(req);
    if (!gate.ok) return gate.response;

    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    const status = getProviderStatus();
    const llm = await chatCompletion(
      [
        { role: "system", content: SYSTEM },
        ...parsed.data.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
      { temperature: 0.7 }
    );

    if (llm) {
      return NextResponse.json({
        reply: llm.content.trim(),
        provider: llm.provider,
        model: llm.model,
        configured: true,
      });
    }

    // Local fallback — scripted friendly French so chat still works offline
    const lastUser =
      [...parsed.data.messages].reverse().find((m) => m.role === "user")
        ?.content || "";
    const idx = Math.abs(lastUser.length) % LOCAL_REPLIES.length;
    return NextResponse.json({
      reply: LOCAL_REPLIES[idx],
      provider: "local",
      model: "plume-local-chat",
      configured: status.configured,
      message:
        "No Gemini/Groq/OpenAI key configured — using local chat lines. Set GEMINI_API_KEY for real conversation practice.",
    });
  } catch {
    return NextResponse.json({ error: "Chat failed" }, { status: 500 });
  }
}
