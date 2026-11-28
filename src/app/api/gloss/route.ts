import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePaidApiCaller } from "@/lib/api-guard";
import { chatCompletion, getProviderStatus } from "@/lib/llm";
import {
  infoManyLocal,
  localGloss,
  localIpa,
  normalizeSay,
  type WordInfo,
} from "@/lib/fr-gloss";

const bodySchema = z.object({
  words: z.array(z.string().min(1).max(64)).min(1).max(80),
  context: z.string().max(800).optional(),
});

export async function GET() {
  return NextResponse.json({
    ...getProviderStatus(),
    mode: "fr→en gloss + English sound-alike",
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
    const gate = await requirePaidApiCaller(req);
    if (!gate.ok) return gate.response;

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
        message: "Set GEMINI_API_KEY for fuller glosses & say-it spellings.",
      });
    }

    const llm = await chatCompletion(
      [
        {
          role: "system",
          content: `You help English speakers learn French. For each French word return a short English gloss AND how to say it in English letters.
Return ONLY JSON:
{"items":{"frenchWord":{"en":"english gloss","say":"zhay-nee-AL"},...}}
Rules:
- en: 1–4 English words (base meaning in this sentence).
- False friends: magasin = shop/store (NOT magazine); librairie = bookstore (NOT library); pain = bread (NOT pain).
- say: English sound-alike ONLY — hyphenated syllables, CAPS on stress when helpful. Examples: bonjour→bohn-ZHOOR, magasin→mah-gah-ZAN, génial→zhay-nee-AL, je→zhuh, café→ka-FAY.
- NEVER use IPA or phonetic symbols (no /slashes/, no ə ɛ ɔ ʃ ʒ etc).
- Keep exact French keys as given.
- Function words stay short (je→zhuh, le→luh).`,
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
          items?: Record<
            string,
            { en?: string; say?: string; ipa?: string }
          >;
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

          const hadLocalEn = Boolean(glosses[w] && glosses[w] !== "…");
          const llmEn =
            (item && typeof item.en === "string" && item.en.trim()) ||
            pickField(obj.glosses, w) ||
            "";
          // Never let the model overwrite a local dictionary gloss (e.g. magasin → magazine)
          const en = hadLocalEn
            ? glosses[w]
            : llmEn || glosses[w] || localGloss(w) || "…";

          const sayRaw =
            (item && typeof item.say === "string" && item.say.trim()) ||
            (item && typeof item.ipa === "string" && item.ipa.trim()) ||
            pickField(obj.pronunciations, w) ||
            pronunciations[w] ||
            "";
          const say =
            normalizeSay(sayRaw) ||
            pronunciations[w] ||
            localIpa(w) ||
            "";

          glosses[w] = String(en).slice(0, 48);
          if (say) pronunciations[w] = say;
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
