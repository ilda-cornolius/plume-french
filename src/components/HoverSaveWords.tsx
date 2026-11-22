"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  className?: string;
  /** Called after a successful Anki save */
  onSaved?: (word: string, message: string) => void;
  onError?: (message: string) => void;
};

type Token =
  | { type: "word"; value: string }
  | { type: "other"; value: string };

/** Split on word boundaries; keep punctuation/spaces as "other". */
export function tokenizeForHover(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[\p{L}\p{M}\p{N}'’\-]+|[^\p{L}\p{M}\p{N}'’\-]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = m[0];
    if (/^[\p{L}\p{M}\p{N}'’\-]+$/u.test(value)) {
      tokens.push({ type: "word", value });
    } else {
      tokens.push({ type: "other", value });
    }
  }
  return tokens;
}

function isSaveableWord(w: string): boolean {
  const clean = w.replace(/['’\-]/g, "");
  if (clean.length < 2) return false;
  // Skip pure numbers
  if (/^\d+$/.test(clean)) return false;
  return true;
}

/**
 * FL-9: render message text so hovering a word offers "Save to Anki"
 * → deck « Plume · Appris » via /api/anki/add-notes.
 */
export function HoverSaveWords({ text, className, onSaved, onError }: Props) {
  const [active, setActive] = useState<{
    word: string;
    x: number;
    y: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const clearHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    clearHide();
    hideTimer.current = setTimeout(() => setActive(null), 280);
  };

  useEffect(() => () => clearHide(), []);

  const saveWord = useCallback(
    async (word: string) => {
      if (busy) return;
      setBusy(true);
      setFlash(null);
      try {
        const res = await fetch("/api/anki/add-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            deckName: "Plume · Appris",
            cards: [
              {
                front: word,
                back: `From Plume chat:\n« ${text.slice(0, 280)} »`,
                tags: ["plume", "chat", "hover"],
              },
            ],
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.needsConnect
            ? "Connect AnkiWeb on the Anki page first."
            : data.error || "Could not save to Anki";
          onError?.(msg);
          setFlash(msg);
          return;
        }
        const msg = data.message || `Saved « ${word} » to Plume · Appris`;
        onSaved?.(word, msg);
        setFlash(msg);
        setActive(null);
      } catch {
        const msg = "Could not reach Anki upload.";
        onError?.(msg);
        setFlash(msg);
      } finally {
        setBusy(false);
        setTimeout(() => setFlash(null), 3500);
      }
    },
    [busy, onError, onSaved, text]
  );

  const tokens = tokenizeForHover(text);

  return (
    <span className={className}>
      {tokens.map((t, i) =>
        t.type === "word" && isSaveableWord(t.value) ? (
          <button
            key={`${i}-${t.value}`}
            type="button"
            className="rounded-sm border-b border-dotted border-transparent px-0.5 transition hover:border-citrus/70 hover:bg-citrus/15 focus:outline-none focus-visible:ring-1 focus-visible:ring-citrus/50"
            onMouseEnter={(e) => {
              clearHide();
              const rect = e.currentTarget.getBoundingClientRect();
              setActive({
                word: t.value,
                x: rect.left + rect.width / 2,
                y: Math.max(rect.top, 48),
              });
            }}
            onMouseLeave={scheduleHide}
            onClick={(e) => {
              e.preventDefault();
              clearHide();
              const rect = e.currentTarget.getBoundingClientRect();
              setActive({
                word: t.value,
                x: rect.left + rect.width / 2,
                y: Math.max(rect.top, 48),
              });
            }}
            onFocus={(e) => {
              clearHide();
              const rect = e.currentTarget.getBoundingClientRect();
              setActive({
                word: t.value,
                x: rect.left + rect.width / 2,
                y: Math.max(rect.top, 48),
              });
            }}
            onBlur={scheduleHide}
            aria-label={`Word: ${t.value}. Save to Anki`}
          >
            {t.value}
          </button>
        ) : (
          <span key={`${i}-o`}>{t.value}</span>
        )
      )}

      {active && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={`Save ${active.word} to Anki`}
          className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-xl border border-[var(--line)] bg-ink px-3 py-2 shadow-glow"
          style={{ left: active.x, top: active.y - 8 }}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
        >
          <p className="mb-1.5 text-center text-sm font-semibold text-paper">
            {active.word}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => saveWord(active.word)}
            className="whitespace-nowrap rounded-full bg-citrus px-3 py-1.5 text-xs font-semibold text-ink hover:bg-citrus-dim disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save to Anki · Appris"}
          </button>
        </div>
      )}

      {flash && (
        <span className="mt-2 block text-xs text-mist/80" role="status">
          {flash}
        </span>
      )}
    </span>
  );
}
