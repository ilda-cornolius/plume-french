/**
 * Multi-provider chat completions for Plume.
 * Preferred: GEMINI_API_KEY (Google AI Studio free tier).
 * Also supports GROQ_API_KEY and OPENAI_API_KEY as fallbacks.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmResult = {
  content: string;
  provider: "gemini" | "groq" | "openai";
  model: string;
};

export type ProviderStatus = {
  configured: boolean;
  providers: {
    gemini: boolean;
    groq: boolean;
    openai: boolean;
  };
  active: "gemini" | "groq" | "openai" | "local";
};

export function getProviderStatus(): ProviderStatus {
  const gemini = Boolean(process.env.GEMINI_API_KEY);
  const groq = Boolean(process.env.GROQ_API_KEY);
  const openai = Boolean(process.env.OPENAI_API_KEY);
  const active = gemini
    ? "gemini"
    : groq
      ? "groq"
      : openai
        ? "openai"
        : "local";
  return {
    configured: gemini || groq || openai,
    providers: { gemini, groq, openai },
    active,
  };
}

async function chatGroq(
  messages: ChatMessage[],
  opts?: { json?: boolean; temperature?: number }
): Promise<LlmResult> {
  const apiKey = process.env.GROQ_API_KEY!;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: opts?.temperature ?? 0.4,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Groq failed (${res.status})`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq empty response");
  return { content, provider: "groq", model };
}

async function chatOpenAiCompatible(
  messages: ChatMessage[],
  opts?: { json?: boolean; temperature?: number }
): Promise<LlmResult> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const base = (
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: opts?.temperature ?? 0.4,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI failed (${res.status})`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI empty response");
  return { content, provider: "openai", model };
}

async function chatGemini(
  messages: ChatMessage[],
  opts?: { json?: boolean; temperature?: number }
): Promise<LlmResult> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts?.temperature ?? 0.4,
      ...(opts?.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini failed (${res.status})`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || "")
    .join("");
  if (!content) throw new Error("Gemini empty response");
  return { content, provider: "gemini", model };
}

/** Prefer Gemini, then Groq, then OpenAI. Returns null if none work. */
export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { json?: boolean; temperature?: number }
): Promise<LlmResult | null> {
  const runners: (() => Promise<LlmResult>)[] = [];
  if (process.env.GEMINI_API_KEY) {
    runners.push(() => chatGemini(messages, opts));
    // Fallback without JSON mime if structured output is rejected
    if (opts?.json) {
      runners.push(() => chatGemini(messages, { ...opts, json: false }));
    }
  }
  if (process.env.GROQ_API_KEY) runners.push(() => chatGroq(messages, opts));
  if (process.env.OPENAI_API_KEY)
    runners.push(() => chatOpenAiCompatible(messages, opts));

  for (const run of runners) {
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("LLM timeout")), 45_000)
        ),
      ]);
    } catch {
      // try next — never log secrets
    }
  }
  return null;
}
