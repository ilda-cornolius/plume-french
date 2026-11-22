"use client";

import { useEffect, useState, useTransition } from "react";
import { awardPracticeXp } from "@/lib/progress";
import { notifyProgressUpdated } from "@/components/LevelBadge";

type Issue = {
  type: string;
  original: string;
  suggestion: string;
  explanation: string;
};

type RewriteResult = {
  original: string;
  corrected: string;
  intent: string;
  issues: Issue[];
  source: "gemini" | "groq" | "openai" | "local-ai";
  model?: string;
  aiConfigured?: boolean;
};

const EXAMPLES = [
  "je want to le store",
  "j'ai un pomme",
  "I want to eat avec mon friend",
  "where is le bathroom",
  "today je am happy",
];

const typeLabel: Record<string, string> = {
  intent: "Intent",
  grammar: "Grammar",
  gender: "Gender",
  spelling: "Spelling",
  vocabulary: "Vocabulary",
  style: "Style",
  other: "Note",
};

function engineLabel(result: RewriteResult): string {
  if (result.source === "local-ai") {
    return "local AI (Franglais) — set GEMINI_API_KEY for Gemini rewrites";
  }
  const name =
    result.source === "gemini"
      ? "Gemini"
      : result.source === "groq"
        ? "Groq"
        : "OpenAI";
  return `${name}${result.model ? ` (${result.model})` : ""}`;
}

export function WritingPractice() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [xpNote, setXpNote] = useState<string | null>(null);
  const [ankiMsg, setAnkiMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savingAnki, setSavingAnki] = useState(false);

  useEffect(() => {
    fetch("/api/correct")
      .then((r) => r.json())
      .then((d) => {
        setAiReady(Boolean(d.aiConfigured));
        setActiveProvider(d.active || null);
      })
      .catch(() => setAiReady(false));
  }, []);

  function runRewrite(value?: string) {
    const payload = (value ?? text).trim();
    if (!payload) return;
    setError(null);
    setAnkiMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/correct", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: payload }),
        });
        if (!res.ok) throw new Error("Rewrite request failed");
        const data = (await res.json()) as RewriteResult;
        setResult(data);
        if (typeof data.aiConfigured === "boolean") {
          setAiReady(data.aiConfigured);
        }
        const award = awardPracticeXp({
          issueCount: data.issues?.length || 0,
          hadChange: data.corrected.trim() !== data.original.trim(),
        });
        notifyProgressUpdated();
        setXpNote(
          award.leveledUp
            ? `+${award.gained} XP · Level up! Now Nv ${award.state.level}`
            : `+${award.gained} XP`
        );
      } catch {
        setError("Could not rewrite right now. Try again in a moment.");
      }
    });
  }

  async function saveToAnki() {
    if (!result) return;
    setSavingAnki(true);
    setAnkiMsg(null);
    try {
      const cards = [
        {
          front: result.corrected,
          back: result.intent || "Phrase apprise dans Plume",
          tags: ["plume", "phrase"],
        },
        ...result.issues
          .filter((i) =>
            ["vocabulary", "gender", "spelling"].includes(i.type)
          )
          .map((i) => ({
            front: i.suggestion || i.original,
            back: i.explanation,
            tags: ["plume", i.type],
          })),
      ];
      const res = await fetch("/api/anki/add-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards, deckName: "Plume · Appris" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnkiMsg(
          data.needsConnect
            ? "Connect AnkiWeb on the Anki page first, then save again."
            : data.error || "Upload failed"
        );
        return;
      }
      setAnkiMsg(data.message || `Saved ${data.added} card(s) to AnkiWeb.`);
    } catch {
      setAnkiMsg("Could not reach Anki upload endpoint.");
    } finally {
      setSavingAnki(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-5 pb-20 pt-4 sm:px-8 sm:pt-8">
      <div className="mb-10 max-w-2xl animate-rise">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-citrus">
          Plume
        </p>
        <h1 className="brand-display text-4xl font-extrabold leading-[1.05] text-paper sm:text-6xl">
          Messy Franglais.
          <br />
          <span className="text-mist">Clear French.</span>
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-mist sm:text-lg">
          Type mixed French and English however it comes out. Plume infers what
          you meant and returns a proper French sentence with a short
          explanation.
        </p>
      </div>

      <div className="panel-interactive animate-rise-delay rounded-2xl p-4 shadow-glow sm:p-6">
        <label htmlFor="french-input" className="sr-only">
          Mixed French or English practice text
        </label>
        <textarea
          id="french-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              runRewrite();
            }
          }}
          placeholder="Écrivez librement… je want to le store"
          rows={5}
          className="w-full resize-y rounded-xl border border-[var(--line)] bg-ink/60 px-4 py-3 text-lg leading-relaxed text-paper outline-none transition placeholder:text-mist/40 focus:border-citrus/50 focus:ring-2 focus:ring-citrus/20"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => runRewrite()}
            disabled={pending || !text.trim()}
            className="rounded-full bg-citrus px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-citrus-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Rewriting…" : "Rewrite in French"}
          </button>
          <span className="text-xs text-mist/60">⌘/Ctrl + Enter</span>
          {aiReady !== null && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                aiReady
                  ? "bg-citrus/15 text-citrus"
                  : "bg-ink-3 text-mist"
              }`}
            >
              {aiReady
                ? `AI on${activeProvider ? ` · ${activeProvider}` : ""}`
                : "Local AI path"}
            </span>
          )}
          {xpNote && (
            <span className="text-xs font-medium text-ember">{xpNote}</span>
          )}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setText(ex);
                runRewrite(ex);
              }}
              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-mist transition hover:border-citrus/40 hover:text-paper"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-ember" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-8 animate-rise-late space-y-5">
          {result.intent && (
            <p className="text-sm text-mist">
              <span className="font-semibold text-paper">Intent: </span>
              {result.intent}
            </p>
          )}

          <div className="panel-interactive rounded-2xl p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mist">
              French
            </p>
            <p className="brand-display mt-2 text-2xl font-bold text-citrus sm:text-3xl">
              {result.corrected}
            </p>
            {result.corrected.trim() !== result.original.trim() && (
              <p className="mt-3 text-sm text-mist/70">
                From:{" "}
                <span className="line-through decoration-mist/40">
                  {result.original}
                </span>
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveToAnki}
                disabled={savingAnki}
                className="rounded-full border border-citrus/40 bg-citrus/10 px-4 py-2 text-sm font-semibold text-citrus hover:bg-citrus/20 disabled:opacity-40"
              >
                {savingAnki ? "Uploading…" : "Save to AnkiWeb"}
              </button>
            </div>
            {ankiMsg && (
              <p className="mt-3 text-sm text-mist" role="status">
                {ankiMsg}
              </p>
            )}
          </div>

          {result.issues.length > 0 && (
            <ul className="space-y-3">
              {result.issues.map((issue, i) => (
                <li
                  key={`${issue.original}-${i}`}
                  className="panel-interactive rounded-xl px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-ink-3 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-citrus">
                      {typeLabel[issue.type] || issue.type}
                    </span>
                    {issue.original && issue.suggestion && (
                      <span className="text-sm text-mist">
                        <span className="text-ember/90">{issue.original}</span>
                        <span className="mx-2 text-mist/40">→</span>
                        <span className="text-paper">{issue.suggestion}</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-mist">
                    {issue.explanation}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-mist/45">Engine: {engineLabel(result)}</p>
        </div>
      )}
    </section>
  );
}
