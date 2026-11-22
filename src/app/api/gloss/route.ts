import { NextResponse } from "next/server";
import { z } from "zod";
import { chatCompletion, getProviderStatus } from "@/lib/llm";
import {
  infoManyLocal,
  localGloss,
  localIpa,
  type WordInfo,
} from "@/lib/fr-gloss";

const bodySchema = z.object({
  words: z.array(z.string().min(1).max(64)).min(1).max(80),
  context: z.string().max(800).optional(),
});

export async function GET() {
  return NextResponse.json({
    ...getProviderStatus(),
    mode: "fr→en gloss + IPA",
  });
}

function pickField(
  map: Record<string, string> | undefined,
  word: string
): string | undefined {
  if (!map) return undefined;
  return (
    map[word] ||
    map[word.toLowerCase()] ||
    Object.entries(map).find(([k]) => k.toLowerCase() === word.toLowerCase())?.[1]
  );
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid words" }, { status: 400 });
    }

    const unique = [
      ...new Set(parsed.data.words.map((w) => w.trim()).filter(Boolean)),
    ];
    const info: Record<string, WordInfo> = infoManyLocal(unique);
    const glosses: Record<string, string> = {};
    const pronunciations: Record<string, string> = {};
    for (const [w, v] of Object.entries(info)) {
      glosses[w] = v.en;
      if (v.ipa) pronunciations[w] = v.ipa;
    }

    const missingEn = unique.filter((w) => !glosses[w]);
    const missingIpa = unique.filter((w) => !pronunciations[w]);
    const needLlm = [...new Set([...missingEn, ...missingIpa])];

    if (needLlm.length === 0) {
      return NextResponse.json({
        glosses,
        pronunciations,
        info,
        source: "local",
        configured: getProviderStatus().configured,
      });
    }

    const status = getProviderStatus();
    if (!status.configured) {
      for (const w of missingEn) glosses[w] = localGloss(w) || "…";
      for (const w of missingIpa) {
        pronunciations[w] = localIpa(w) || "";
      }
      return NextResponse.json({
        glosses,
        pronunciations,
        source: "local",
        configured: false,
        message: "Set GEMINI_API_KEY for fuller glosses & IPA.",
      });
    }

    const llm = await chatCompletion(
      [
        {
          role: "system",
          content: `You help French learners. For each French word return a short English gloss AND pronunciation.
Return ONLY JSON:
{"items":{"frenchWord":{"en":"english gloss","ipa":"/ipa/ or readable approx"},...}}
Rules:
- en: 1–4 English words (base meaning).
- ipa: Prefer IPA in /slashes/ (French). If unsure, use a readable approx like "boh-zhoor".
- Keep exact French keys as given.
- Function words stay short (je→I /ʒə/).`,
        },
        {
          role: "user",
          content: JSON.stringify({
            words: needLlm,
            context: parsed.data.context?.slice(0, 400) || null,
          }),
        },
      ],
      { json: true, temperature: 0.1 }
    );

    if (llm) {
      try {
        const raw = llm.content.trim();
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        const slice =
          start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
        const obj = JSON.parse(slice) as {
          items?: Record<string, { en?: string; ipa?: string }>;
          glosses?: Record<string, string>;
          pronunciations?: Record<string, string>;
        };

        for (const w of needLlm) {
          const item =
            obj.items?.[w] ||
            obj.items?.[w.toLowerCase()] ||
            Object.entries(obj.items || {}).find(
              ([k]) => k.toLowerCase() === w.toLowerCase()
            )?.[1];

          const en =
            (item && typeof item.en === "string" && item.en.trim()) ||
            pickField(obj.glosses, w) ||
            glosses[w] ||
            "…";
          const ipa =
            (item && typeof item.ipa === "string" && item.ipa.trim()) ||
            pickField(obj.pronunciations, w) ||
            pronunciations[w] ||
            "";

          glosses[w] = String(en).slice(0, 48);
          if (ipa) pronunciations[w] = String(ipa).slice(0, 64);
          info[w] = { en: glosses[w], ipa: pronunciations[w] || "" };
        }

        return NextResponse.json({
          glosses,
          pronunciations,
          info,
          source: llm.provider,
          model: llm.model,
          configured: true,
        });
      } catch {
        // fall through
      }
    }

    for (const w of missingEn) glosses[w] = glosses[w] || "…";
    return NextResponse.json({
      glosses,
      pronunciations,
      source: "local",
      configured: status.configured,
    });
  } catch {
    return NextResponse.json({ error: "Gloss failed" }, { status: 500 });
  }
}
