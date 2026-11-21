export type CorrectionIssue = {
  type: "grammar" | "gender" | "spelling" | "style" | "other";
  original: string;
  suggestion: string;
  explanation: string;
  offset: number;
  length: number;
};

export type CorrectionResult = {
  original: string;
  corrected: string;
  issues: CorrectionIssue[];
  source: "languagetool" | "local";
};

type LTMatch = {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule?: {
    id?: string;
    description?: string;
    category?: { id?: string; name?: string };
  };
};

function classifyIssue(match: LTMatch): CorrectionIssue["type"] {
  const cat = (match.rule?.category?.id || "").toUpperCase();
  const id = (match.rule?.id || "").toUpperCase();
  const msg = `${match.message} ${match.shortMessage || ""}`.toLowerCase();

  if (
    cat.includes("TYPOS") ||
    id.includes("HUNSPELL") ||
    msg.includes("orthographe") ||
    msg.includes("spelling")
  ) {
    return "spelling";
  }
  if (
    msg.includes("genre") ||
    msg.includes("féminin") ||
    msg.includes("masculin") ||
    msg.includes("accord") ||
    id.includes("ACCORD") ||
    id.includes("GENRE")
  ) {
    return "gender";
  }
  if (cat.includes("STYLE") || cat.includes("REDUNDANCY")) {
    return "style";
  }
  if (cat.includes("GRAMMAR") || cat.includes("CAT_GRAMMAIRE")) {
    return "grammar";
  }
  return "other";
}

function applyReplacements(
  text: string,
  matches: { offset: number; length: number; replacement: string }[]
): string {
  const ordered = [...matches].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const m of ordered) {
    result =
      result.slice(0, m.offset) +
      m.replacement +
      result.slice(m.offset + m.length);
  }
  return result;
}

/** Local heuristics for common French learner mistakes when LanguageTool is unavailable. */
function localCorrect(text: string): CorrectionResult {
  const issues: CorrectionIssue[] = [];
  let working = text;

  const patterns: {
    re: RegExp;
    suggestion: (m: RegExpMatchArray) => string;
    explanation: string;
    type: CorrectionIssue["type"];
  }[] = [
    {
      re: /\b(un)\s+(pomme|école|orange|heure|histoire|amie|idée|île|eau|étude)\b/gi,
      suggestion: (m) => `une ${m[2]}`,
      explanation: "Feminine nouns take « une », not « un ».",
      type: "gender",
    },
    {
      re: /\b(une)\s+(livre|stylo|garçon|homme|arbre|ordinateur|problème)\b/gi,
      suggestion: (m) => `un ${m[2]}`,
      explanation: "Masculine nouns take « un », not « une ».",
      type: "gender",
    },
    {
      re: /\b(le)\s+(pomme|école|orange|heure|histoire|amie|idée)\b/gi,
      suggestion: (m) => {
        const n = m[2].toLowerCase();
        if ("aeiouhâéèêëîïôùûü".includes(n[0])) return `l'${m[2]}`;
        return `la ${m[2]}`;
      },
      explanation: "Article gender or elision does not match the noun.",
      type: "gender",
    },
    {
      re: /\bje\s+ai\b/gi,
      suggestion: () => "j'ai",
      explanation: "Elide « je » before a vowel: j'ai.",
      type: "grammar",
    },
    {
      re: /\bje\s+aime\b/gi,
      suggestion: () => "j'aime",
      explanation: "Elide « je » before a vowel sound: j'aime.",
      type: "grammar",
    },
    {
      re: /\bc'est\s+des\b/gi,
      suggestion: () => "ce sont des",
      explanation: "Use « ce sont » before a plural noun phrase.",
      type: "grammar",
    },
    {
      re: /\bils?\s+est\b/gi,
      suggestion: (m) => (m[0].toLowerCase().startsWith("ils") ? "ils sont" : "il est"),
      explanation: "Check subject–verb agreement with être.",
      type: "grammar",
    },
    {
      re: /\b(beaucoup)\s+des\b/gi,
      suggestion: () => "beaucoup de",
      explanation: "After « beaucoup », use « de », not « des ».",
      type: "grammar",
    },
    {
      re: /\b(j'ai)\s+(manger|finir|parler|aller)\b/gi,
      suggestion: (m) => {
        const map: Record<string, string> = {
          manger: "mangé",
          finir: "fini",
          parler: "parlé",
          aller: "allé",
        };
        return `${m[1]} ${map[m[2].toLowerCase()] || m[2]}`;
      },
      explanation: "Use the past participle after « avoir » in passé composé.",
      type: "grammar",
    },
  ];

  for (const p of patterns) {
    const re = new RegExp(p.re.source, p.re.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(working)) !== null) {
      const suggestion = p.suggestion(match);
      issues.push({
        type: p.type,
        original: match[0],
        suggestion,
        explanation: p.explanation,
        offset: match.index,
        length: match[0].length,
      });
    }
  }

  // Apply non-overlapping replacements left-to-right on a copy
  if (issues.length) {
    const replacements = issues
      .map((i) => ({
        offset: i.offset,
        length: i.length,
        replacement: i.suggestion,
      }))
      .sort((a, b) => a.offset - b.offset);

    const filtered: typeof replacements = [];
    let cursor = 0;
    for (const r of replacements) {
      if (r.offset >= cursor) {
        filtered.push(r);
        cursor = r.offset + r.length;
      }
    }
    working = applyReplacements(text, filtered);
  }

  // Light capitalization of sentence starts
  working = working.replace(/(^|[.!?]\s+)([a-zàâäéèêëïîôùûüç])/g, (_, a, b) => a + b.toUpperCase());

  return {
    original: text,
    corrected: working.trim() === text.trim() && issues.length === 0 ? text : working,
    issues,
    source: "local",
  };
}

async function languageToolCorrect(text: string): Promise<CorrectionResult | null> {
  const endpoint =
    process.env.LANGUAGETOOL_API_URL ||
    "https://api.languagetool.org/v2/check";

  const body = new URLSearchParams({
    text,
    language: "fr",
    enabledOnly: "false",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { matches?: LTMatch[] };
    const matches = data.matches || [];

    const issues: CorrectionIssue[] = [];
    const replacements: { offset: number; length: number; replacement: string }[] = [];

    for (const m of matches) {
      const suggestion = m.replacements?.[0]?.value;
      if (!suggestion) continue;
      const original = text.slice(m.offset, m.offset + m.length);
      issues.push({
        type: classifyIssue(m),
        original,
        suggestion,
        explanation: m.shortMessage || m.message || "Correction suggested.",
        offset: m.offset,
        length: m.length,
      });
      replacements.push({
        offset: m.offset,
        length: m.length,
        replacement: suggestion,
      });
    }

    // Drop overlapping matches (keep earliest)
    const filtered: typeof replacements = [];
    const filteredIssues: CorrectionIssue[] = [];
    let cursor = 0;
    const paired = replacements
      .map((r, i) => ({ r, issue: issues[i] }))
      .sort((a, b) => a.r.offset - b.r.offset);
    for (const { r, issue } of paired) {
      if (r.offset >= cursor) {
        filtered.push(r);
        filteredIssues.push(issue);
        cursor = r.offset + r.length;
      }
    }

    return {
      original: text,
      corrected: applyReplacements(text, filtered),
      issues: filteredIssues,
      source: "languagetool",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function correctFrench(text: string): Promise<CorrectionResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { original: text, corrected: text, issues: [], source: "local" };
  }

  const lt = await languageToolCorrect(trimmed);
  if (lt) {
    // If LT found nothing, still run local heuristics for learner-specific patterns
    if (lt.issues.length === 0) {
      const local = localCorrect(trimmed);
      if (local.issues.length > 0) return local;
    }
    return lt;
  }
  return localCorrect(trimmed);
}
