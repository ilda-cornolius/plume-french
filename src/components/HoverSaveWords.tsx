"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WordInfo = { en: string; ipa: string };

type Props = {
  text: string;
  className?: string;
  /** FL-12: show English under each French word (IPA also when on) */
  glossEnabled?: boolean;
  onSaved?: (word: string, message: string) => void;
  onError?: (message: string) => void;
};

type Token =
  | { type: "word"; value: string }
  | { type: "other"; value: string };

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
  if (/^\d+$/.test(clean)) return false;
  return true;
}

const infoCache = new Map<string, WordInfo>();

async function fetchWordInfo(
  words: string[],
  context: string
): Promise<Record<string, WordInfo>> {
  const missing = words.filter((w) => !infoCache.has(w.toLowerCase()));
  const fromCache: Record<string, WordInfo> = {};
  for (const w of words) {
    const c = infoCache.get(w.toLowerCase());
    if (c) fromCache[w] = c;
  }
  if (!missing.length) return fromCache;

  const res = await fetch("/api/gloss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      words: [...new Set(missing)],
      context: context.slice(0, 400),
    }),
  });
  const data = await res.json();
  const next: Record<string, WordInfo> = { ...fromCache };

  const glosses = (data.glosses || {}) as Record<string, string>;
  const pronunciations = (data.pronunciations || {}) as Record<string, string>;
  const info = (data.info || {}) as Record<string, WordInfo>;

  for (const w of missing) {
    const fromInfo = info[w] || info[w.toLowerCase()];
    const en =
      (fromInfo && fromInfo.en) ||
      glosses[w] ||
      glosses[w.toLowerCase()] ||
      "…";
    const ipa =
      (fromInfo && fromInfo.ipa) ||
      pronunciations[w] ||
      pronunciations[w.toLowerCase()] ||
      "";
    const entry = { en: String(en).trim(), ipa: String(ipa).trim() };
    infoCache.set(w.toLowerCase(), entry);
    next[w] = entry;
  }
  return next;
}

/**
 * FL-9/12/13: hover save to Anki; English under FR when toggled; IPA on hover (and under FR when toggled).
 */
export function HoverSaveWords({
  text,
  className,
  glossEnabled = false,
  onSaved,
  onError,
}: Props) {
  const [active, setActive] = useState<{
    word: string;
    en: string;
    ipa: string;
    x: number;
    y: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [infos, setInfos] = useState<Record<string, WordInfo>>({});
  const [loading, setLoading] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokens = tokenizeForHover(text);
  const words = tokens
    .filter((t): t is { type: "word"; value: string } => t.type === "word")
    .map((t) => t.value)
    .filter(isSaveableWord);

  useEffect(() => {
    if (!glossEnabled || words.length === 0) return;
    let cancelled = false;
    setLoading(true);
    fetchWordInfo(words, text)
      .then((map) => {
        if (!cancelled) setInfos((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glossEnabled, text]);

  const infoOf = useCallback(
    (word: string): WordInfo => {
      return (
        infos[word] ||
        infoCache.get(word.toLowerCase()) || {
          en: loading ? "…" : "",
          ipa: "",
        }
      );
    },
    [infos, loading]
  );

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

  const openWord = async (word: string, el: HTMLElement) => {
    clearHide();
    const rect = el.getBoundingClientRect();
    let info = infoOf(word);
    setActive({
      word,
      en: info.en || "…",
      ipa: info.ipa || "",
      x: rect.left + rect.width / 2,
      y: Math.max(rect.top, 48),
    });

    // Always refresh pronunciation/meaning on hover if incomplete
    if (!info.en || info.en === "…" || !info.ipa) {
      try {
        const map = await fetchWordInfo([word], text);
        info = map[word] || info;
        setInfos((prev) => ({ ...prev, ...map }));
        setActive((cur) =>
          cur && cur.word === word
            ? { ...cur, en: info.en || cur.en, ipa: info.ipa || cur.ipa }
            : cur
        );
      } catch {
        // ignore
      }
    }
  };

  const saveWord = useCallback(
    async (word: string, en: string, ipa: string) => {
      if (busy) return;
      setBusy(true);
      setFlash(null);
      const meaning = en && en !== "…" ? en : infoOf(word).en;
      const pron = ipa || infoOf(word).ipa;
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
                back: [
                  meaning && meaning !== "…" ? meaning : "English meaning",
                  pron ? `Pronunciation: ${pron}` : "",
                  "",
                  `Context: « ${text.slice(0, 200)} »`,
                ]
                  .filter(Boolean)
                  .join("\n"),
                tags: ["plume", "chat", "hover", "gloss", "ipa"],
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
        const msg =
          data.message ||
          `Saved « ${word} »${meaning && meaning !== "…" ? ` → ${meaning}` : ""}${pron ? ` ${pron}` : ""}`;
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
    [busy, infoOf, onError, onSaved, text]
  );

  return (
    <span className={className}>
      {tokens.map((t, i) =>
        t.type === "word" && isSaveableWord(t.value) ? (
          <button
            key={`${i}-${t.value}`}
            type="button"
            className={`inline-flex flex-col items-center rounded-sm px-0.5 align-baseline transition hover:bg-citrus/15 focus:outline-none focus-visible:ring-1 focus-visible:ring-citrus/50 ${
              glossEnabled
                ? "mx-0.5 py-0.5"
                : "border-b border-dotted border-transparent hover:border-citrus/70"
            }`}
            onMouseEnter={(e) => void openWord(t.value, e.currentTarget)}
            onMouseLeave={scheduleHide}
            onClick={(e) => {
              e.preventDefault();
              void openWord(t.value, e.currentTarget);
            }}
            onFocus={(e) => void openWord(t.value, e.currentTarget)}
            onBlur={scheduleHide}
            aria-label={`${t.value}${infoOf(t.value).en ? `: ${infoOf(t.value).en}` : ""}${infoOf(t.value).ipa ? ` ${infoOf(t.value).ipa}` : ""}. Save to Anki`}
          >
            <span className="leading-tight">{t.value}</span>
            {glossEnabled && (
              <>
                <span className="mt-0.5 max-w-[7.5rem] truncate text-center text-[10px] font-normal leading-tight text-mist/80">
                  {infoOf(t.value).en || (loading ? "…" : "·")}
                </span>
                {infoOf(t.value).ipa ? (
                  <span className="max-w-[7.5rem] truncate text-center font-mono text-[9px] font-normal leading-tight text-mist/55">
                    {infoOf(t.value).ipa}
                  </span>
                ) : null}
              </>
            )}
          </button>
        ) : glossEnabled && t.type === "other" && /^\s+$/.test(t.value) ? (
          <span key={`${i}-o`} className="inline-block w-1.5" />
        ) : (
          <span key={`${i}-o`}>{t.value}</span>
        )
      )}

      {active && (
        <div
          role="dialog"
          aria-label={`Save ${active.word} to Anki`}
          className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-xl border border-[var(--line)] bg-ink px-3 py-2 shadow-glow"
          style={{ left: active.x, top: active.y - 8 }}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
        >
          <p className="text-center text-sm font-semibold text-paper">
            {active.word}
          </p>
          <p className="text-center text-xs text-mist">
            {active.en && active.en !== "…" ? active.en : infoOf(active.word).en || "…"}
          </p>
          {(active.ipa || infoOf(active.word).ipa) && (
            <p className="mb-1.5 text-center font-mono text-[11px] text-citrus/90">
              {active.ipa || infoOf(active.word).ipa}
            </p>
          )}
          {!(active.ipa || infoOf(active.word).ipa) && (
            <p className="mb-1.5 text-center text-[10px] text-mist/50">…</p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              saveWord(
                active.word,
                active.en || infoOf(active.word).en,
                active.ipa || infoOf(active.word).ipa
              )
            }
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

export const GLOSS_TOGGLE_KEY = "plume_gloss_en";

export function readGlossEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(GLOSS_TOGGLE_KEY);
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export function writeGlossEnabled(on: boolean) {
  try {
    localStorage.setItem(GLOSS_TOGGLE_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}
