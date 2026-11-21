/**
 * AI-first French rewrite for messy / mixed French–English practice input.
 * Prefers OpenAI-compatible APIs when OPENAI_API_KEY is set; otherwise a
 * solid local Franglais → French path (mockable / offline).
 */

export type RewriteIssue = {
  type: "intent" | "grammar" | "gender" | "spelling" | "vocabulary" | "style" | "other";
  original: string;
  suggestion: string;
  explanation: string;
};

export type RewriteResult = {
  original: string;
  corrected: string;
  intent: string;
  issues: RewriteIssue[];
  source: "openai" | "local-ai";
  model?: string;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are Plume, a French writing coach for learners.
The user may write messy mixed French and English (Franglais), typos, or incomplete sentences.
Your job:
1) Infer what they meant to say.
2) Produce ONE natural, correct French sentence (or short paragraph if they wrote more).
3) Explain briefly what you changed (vocabulary, gender, grammar, word order).

Respond with ONLY valid JSON (no markdown):
{
  "intent": "short English paraphrase of what they meant",
  "corrected": "proper French sentence",
  "issues": [
    { "type": "intent|grammar|gender|spelling|vocabulary|style|other", "original": "snippet", "suggestion": "fix", "explanation": "one short sentence" }
  ]
}`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return JSON");
  }
}

function normalizeResult(
  original: string,
  raw: unknown,
  source: RewriteResult["source"],
  model?: string
): RewriteResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const corrected =
    typeof obj.corrected === "string" && obj.corrected.trim()
      ? obj.corrected.trim()
      : original;
  const intent =
    typeof obj.intent === "string" && obj.intent.trim()
      ? obj.intent.trim()
      : "Inferred from mixed input";
  const issuesRaw = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: RewriteIssue[] = issuesRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const i = item as Record<string, unknown>;
      const type = String(i.type || "other") as RewriteIssue["type"];
      return {
        type: [
          "intent",
          "grammar",
          "gender",
          "spelling",
          "vocabulary",
          "style",
          "other",
        ].includes(type)
          ? type
          : "other",
        original: String(i.original || ""),
        suggestion: String(i.suggestion || ""),
        explanation: String(i.explanation || ""),
      } satisfies RewriteIssue;
    })
    .filter((x): x is RewriteIssue => !!x && (!!x.explanation || !!x.suggestion));

  return { original, corrected, intent, issues, source, model };
}

async function openAiRewrite(text: string): Promise<RewriteResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const base =
    (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Rewrite into proper French and explain:\n\n${text}`,
    },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Do not log body (may echo prompts); fall through to local
      return null;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return normalizeResult(text, extractJson(content), "openai", model);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Lexicon + pattern rewriter for Franglais when no API key is configured. */
function localAiRewrite(text: string): RewriteResult {
  const original = text.trim();
  const lower = original.toLowerCase();
  const issues: RewriteIssue[] = [];

  // Phrase-level templates (intent first)
  const phrases: {
    test: RegExp;
    corrected: string;
    intent: string;
    notes: RewriteIssue[];
  }[] = [
    {
      test: /\bje\s+want\s+to\s+(go\s+to\s+)?(le\s+)?store\b/i,
      corrected: "Je veux aller au magasin.",
      intent: "I want to go to the store",
      notes: [
        {
          type: "vocabulary",
          original: "want to",
          suggestion: "veux",
          explanation: "English « want » → French « vouloir » (je veux).",
        },
        {
          type: "vocabulary",
          original: "le store",
          suggestion: "au magasin",
          explanation: "« store » → « magasin »; use « au » for “to the”.",
        },
      ],
    },
    {
      test: /\bje\s+want\s+(a|un|une)?\s*(coffee|café)\b/i,
      corrected: "Je veux un café.",
      intent: "I want a coffee",
      notes: [
        {
          type: "vocabulary",
          original: "want",
          suggestion: "veux",
          explanation: "Use « je veux » for “I want”.",
        },
      ],
    },
    {
      test: /\bi\s+(want|need)\s+to\s+(eat|manger)(\s+avec\s+(mon|ma|mes)\s+\w+|\s+with\s+(my\s+)?friend[s]?)\b/i,
      corrected: "Je veux manger avec mon ami.",
      intent: "I want to eat with my friend",
      notes: [
        {
          type: "intent",
          original: "I want to eat with my friend",
          suggestion: "Je veux manger avec mon ami.",
          explanation: "Mixed English/French rendered with « vouloir » + infinitive.",
        },
        {
          type: "vocabulary",
          original: "friend",
          suggestion: "ami",
          explanation: "« friend » → « ami » (use « amie » if feminine).",
        },
      ],
    },
    {
      test: /\bi\s+(want|need)\s+to\s+(eat|manger)\b/i,
      corrected: "Je veux manger.",
      intent: "I want to eat",
      notes: [
        {
          type: "intent",
          original: "I want to eat",
          suggestion: "Je veux manger.",
          explanation: "Full English clause rendered as natural French.",
        },
      ],
    },
    {
      test: /\b(can\s+you|tu\s+can)\s+(help|aider)/i,
      corrected: "Peux-tu m'aider ?",
      intent: "Can you help me?",
      notes: [
        {
          type: "vocabulary",
          original: "can you help",
          suggestion: "Peux-tu m'aider ?",
          explanation: "Polite informal request in French.",
        },
      ],
    },
    {
      test: /\bje\s+(suis|ai)\s+(tired|fatigué)/i,
      corrected: "Je suis fatigué(e).",
      intent: "I am tired",
      notes: [
        {
          type: "vocabulary",
          original: "tired",
          suggestion: "fatigué(e)",
          explanation: "Agree the adjective: fatigué / fatiguée.",
        },
      ],
    },
    {
      test: /\bj['’]?ai\s+un\s+pomme\b/i,
      corrected: "J'ai une pomme.",
      intent: "I have an apple",
      notes: [
        {
          type: "gender",
          original: "un pomme",
          suggestion: "une pomme",
          explanation: "« pomme » is feminine → une.",
        },
      ],
    },
    {
      test: /\bwhere\s+is\s+(le|la|the)?\s*(bathroom|toilettes|wc)\b/i,
      corrected: "Où sont les toilettes ?",
      intent: "Where is the bathroom?",
      notes: [
        {
          type: "vocabulary",
          original: "where is the bathroom",
          suggestion: "Où sont les toilettes ?",
          explanation: "Common traveler phrase; French often uses plural « toilettes ».",
        },
      ],
    },
    {
      test: /\bje\s+go\s+(to\s+)?(the\s+)?(school|école)\b/i,
      corrected: "Je vais à l'école.",
      intent: "I go / am going to school",
      notes: [
        {
          type: "vocabulary",
          original: "go",
          suggestion: "vais",
          explanation: "« aller » conjugated: je vais.",
        },
      ],
    },
    {
      test: /\btoday\s+je\s+(am|suis)\s+(happy|heureux|heureuse)/i,
      corrected: "Aujourd'hui, je suis heureux / heureuse.",
      intent: "Today I am happy",
      notes: [
        {
          type: "vocabulary",
          original: "today",
          suggestion: "Aujourd'hui",
          explanation: "English time word swapped for French.",
        },
      ],
    },
  ];

  for (const p of phrases) {
    if (p.test.test(original)) {
      return {
        original,
        corrected: p.corrected,
        intent: p.intent,
        issues: p.notes,
        source: "local-ai",
        model: "plume-local-franglais",
      };
    }
  }

  // Token lexicon rewrite
  const lexicon: Record<string, string> = {
    i: "je",
    you: "tu",
    we: "nous",
    they: "ils",
    want: "veux",
    wants: "veut",
    need: "ai besoin de",
    go: "vais",
    going: "vais",
    to: "à",
    the: "le",
    a: "un",
    an: "un",
    my: "mon",
    your: "ton",
    and: "et",
    or: "ou",
    but: "mais",
    with: "avec",
    without: "sans",
    for: "pour",
    from: "de",
    store: "magasin",
    shop: "boutique",
    food: "nourriture",
    water: "eau",
    bread: "pain",
    apple: "pomme",
    coffee: "café",
    tea: "thé",
    school: "école",
    house: "maison",
    home: "maison",
    friend: "ami",
    friends: "amis",
    today: "aujourd'hui",
    tomorrow: "demain",
    yesterday: "hier",
    please: "s'il te plaît",
    thanks: "merci",
    thank: "merci",
    hello: "bonjour",
    bye: "au revoir",
    yes: "oui",
    no: "non",
    eat: "manger",
    drink: "boire",
    see: "voir",
    like: "aime",
    love: "adore",
    have: "ai",
    is: "est",
    are: "sont",
    am: "suis",
    was: "étais",
    very: "très",
    really: "vraiment",
    now: "maintenant",
    here: "ici",
    there: "là",
    where: "où",
    what: "quoi",
    when: "quand",
    why: "pourquoi",
    how: "comment",
    because: "parce que",
    this: "ce",
    that: "ça",
    help: "aider",
    buy: "acheter",
    work: "travailler",
    study: "étudier",
    learn: "apprendre",
    speak: "parler",
    french: "français",
    english: "anglais",
  };

  const tokens = original.split(/(\s+|[.,!?;:'’])/);
  const out: string[] = [];
  let swapped = 0;

  for (const tok of tokens) {
    if (!tok || /^\s+$/.test(tok) || /^[.,!?;:'’]+$/.test(tok)) {
      out.push(tok);
      continue;
    }
    const key = tok.toLowerCase();
    if (lexicon[key]) {
      let repl = lexicon[key];
      if (/^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]/.test(tok)) {
        repl = repl.charAt(0).toUpperCase() + repl.slice(1);
      }
      if (repl !== tok) {
        swapped++;
        issues.push({
          type: "vocabulary",
          original: tok,
          suggestion: repl,
          explanation: `Replaced English « ${tok} » with French « ${repl} ».`,
        });
      }
      out.push(repl);
    } else {
      out.push(tok);
    }
  }

  let corrected = out.join("").replace(/\s+/g, " ").trim();

  // Light grammar cleanup on the rewritten string
  const cleanups: { re: RegExp; to: string; explanation: string; type: RewriteIssue["type"] }[] = [
    {
      re: /\bje\s+veux\s+à\s+/gi,
      to: "je veux ",
      explanation: "Drop stray « à » after « veux » before an infinitive.",
      type: "grammar",
    },
    {
      re: /\bje\s+ai\b/gi,
      to: "j'ai",
      explanation: "Elide « je » before a vowel: j'ai.",
      type: "grammar",
    },
    {
      re: /\bun\s+pomme\b/gi,
      to: "une pomme",
      explanation: "« pomme » is feminine.",
      type: "gender",
    },
    {
      re: /\bau\s+le\s+/gi,
      to: "au ",
      explanation: "« à + le » contracts to « au ».",
      type: "grammar",
    },
    {
      re: /\bà\s+le\s+/gi,
      to: "au ",
      explanation: "« à + le » contracts to « au ».",
      type: "grammar",
    },
    {
      re: /\bà\s+les\s+/gi,
      to: "aux ",
      explanation: "« à + les » contracts to « aux ».",
      type: "grammar",
    },
  ];

  for (const c of cleanups) {
    if (c.re.test(corrected)) {
      const before = corrected;
      corrected = corrected.replace(c.re, c.to);
      if (before !== corrected) {
        issues.push({
          type: c.type,
          original: before,
          suggestion: corrected,
          explanation: c.explanation,
        });
      }
    }
  }

  // Capitalize first letter + terminal punctuation
  if (corrected) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
    if (!/[.!?…]$/.test(corrected)) corrected += ".";
  }

  const looksMixed = /[a-z]/i.test(lower) && /[àâäéèêëïîôùûüç]|je|tu|nous|vous|le|la|les|un|une/.test(lower);
  const intent =
    swapped > 0 || looksMixed
      ? "Mixed French/English turned into a French sentence"
      : "Polished toward natural French";

  if (issues.length === 0 && corrected !== original) {
    issues.push({
      type: "intent",
      original,
      suggestion: corrected,
      explanation:
        "Inferred intent and rewrote into a clearer French sentence (local AI path — add OPENAI_API_KEY for full model quality).",
    });
  } else if (issues.length === 0) {
    issues.push({
      type: "style",
      original,
      suggestion: corrected,
      explanation:
        "No strong Franglais cues found. Add OPENAI_API_KEY for richer AI rewrites of free-form mixed input.",
    });
  }

  // Cap issue list
  const deduped = issues.slice(0, 6);

  return {
    original,
    corrected,
    intent,
    issues: deduped,
    source: "local-ai",
    model: "plume-local-franglais",
  };
}

export async function rewriteToFrench(text: string): Promise<RewriteResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      original: text,
      corrected: text,
      intent: "",
      issues: [],
      source: "local-ai",
    };
  }

  const ai = await openAiRewrite(trimmed);
  if (ai) return ai;
  return localAiRewrite(trimmed);
}

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
