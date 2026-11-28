"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeSay } from "@/lib/fr-gloss";

type WordInfo = { en: string; ipa: string };

type Props = {
  text: string;
  className?: string;
  /** FL-12: show English under each French word */
  glossEnabled?: boolean;
  /** FL-13/15: show English sound-alike under words / in hover popup */
  pronunciationEnabled?: boolean;
  /**
   * Contrast for under-word gloss/say-it lines.
   * Use `on-light` on citrus/user bubbles; `on-dark` on ink panels (default).
   */
  tone?: "on-dark" | "on-light";
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

/** Bump when pronunciation format changes so stale IPA cache is dropped. */
const CACHE_VERSION = "say-v2";
const infoCache = new Map<string, WordInfo>();

function cacheKey(word: string): string {
  return `${CACHE_VERSION}:${word.toLowerCase()}`;
}

function readCache(word: string): WordInfo | undefined {
  const hit = infoCache.get(cacheKey(word));
  if (!hit) return undefined;
  const say = normalizeSay(hit.ipa);
  if (hit.ipa && !say) {
    infoCache.delete(cacheKey(word));
    return undefined;
  }
  return say === hit.ipa ? hit : { ...hit, ipa: say };
}

async function fetchWordInfo(
  words: string[],
  context: string
): Promise<Record<string, WordInfo>> {
  const missing = words.filter((w) => !readCache(w));
  const fromCache: Record<string, WordInfo> = {};
  for (const w of words) {
    const c = readCache(w);
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
    const raw =
      (fromInfo && fromInfo.ipa) ||
      pronunciations[w] ||
      pronunciations[w.toLowerCase()] ||
      "";
    const entry = {
      en: String(en).trim(),
      ipa: normalizeSay(String(raw)),
    };
    infoCache.set(cacheKey(w), entry);
    next[w] = entry;
  }
  return next;
}

/**
 * FL-9/12/13/15: hover save; EN under FR; English sound-alike pronunciation.
 */
export function HoverSaveWords({
  text,
  className,
  glossEnabled = false,
  pronunciationEnabled = false,
  tone = "on-dark",
  onSaved,
  onError,
}: Props) {
  const glossClass =
    tone === "on-light" ? "text-ink/65" : "text-mist/80";
  const sayClass =
    tone === "on-light" ? "text-ink/50" : "text-mist/55";
  const hoverBg =
    tone === "on-light" ? "hover:bg-ink/10" : "hover:bg-citrus/15";
  const [active, setActive] = useState<{
    word: string;
    en: string;
    ipa: string;
    x: number;
    y: number;
    place: "above" | "below";
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
    if ((!glossEnabled && !pronunciationEnabled) || words.length === 0) return;
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
  }, [glossEnabled, pronunciationEnabled, text]);

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

  // Close save popup on outside pointer / Escape so it can't block the chat box
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[role="dialog"]')) return;
      if (t?.closest?.("button[aria-label]")) return;
      setActive(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [active]);

  const openWord = async (word: string, el: HTMLElement) => {
    clearHide();
    const rect = el.getBoundingClientRect();
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    // Prefer above when near the chat composer / bottom of the screen
    const place: "above" | "below" =
      rect.top < 120 && rect.bottom <= vh - 200 ? "below" : "above";
    let info = infoOf(word);
    setActive({
      word,
      en: info.en || "…",
      ipa: info.ipa || "",
      x: rect.left + rect.width / 2,
      y: place === "above" ? Math.max(rect.top, 48) : rect.bottom + 8,
      place,
    });

    // Hover card always needs meaning + pronunciation (toggles only control under-word lines)
    try {
      const map = await fetchWordInfo([word], text);
      info = map[word] || info;
      setInfos((prev) => ({ ...prev, ...map }));
      setActive((cur) =>
        cur && cur.word === word
          ? {
              ...cur,
              en: info.en || cur.en || "…",
              ipa: info.ipa || cur.ipa || "",
              place: cur.place,
            }
          : cur
      );
    } catch {
      // ignore — card still shows cached / placeholder values
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
            tabIndex={-1}
            className={`inline-flex min-h-9 min-w-[1.75rem] flex-col items-center justify-center rounded-sm px-0.5 align-baseline transition touch-manipulation ${hoverBg} focus:outline-none focus-visible:ring-1 focus-visible:ring-citrus/50 ${
              glossEnabled || pronunciationEnabled ? "mx-0.5 py-0.5" : ""
            }`}
            onMouseEnter={(e) => {
              if (window.matchMedia("(hover: hover)").matches) {
                void openWord(t.value, e.currentTarget);
              }
            }}
            onMouseLeave={() => {
              if (window.matchMedia("(hover: hover)").matches) scheduleHide();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void openWord(t.value, e.currentTarget);
            }}
            aria-label={`${t.value}${infoOf(t.value).en ? `: ${infoOf(t.value).en}` : ""}${infoOf(t.value).ipa ? ` (${infoOf(t.value).ipa})` : ""}. Meaning, pronunciation, save to Anki`}
          >
            <span
              className={`leading-tight ${
                glossEnabled || pronunciationEnabled
                  ? ""
                  : "underline decoration-dotted decoration-citrus/50 underline-offset-2"
              }`}
            >
              {t.value}
            </span>
            {glossEnabled && (
              <span
                className={`mt-0.5 max-w-[7.5rem] truncate text-center text-[10px] font-normal leading-tight ${glossClass}`}
              >
                {infoOf(t.value).en || (loading ? "…" : "·")}
              </span>
            )}
            {pronunciationEnabled && infoOf(t.value).ipa ? (
              <span
                className={`max-w-[8rem] truncate text-center text-[9px] font-normal italic leading-tight ${sayClass}`}
              >
                {infoOf(t.value).ipa}
              </span>
            ) : null}
          </button>
        ) : (glossEnabled || pronunciationEnabled) &&
          t.type === "other" &&
          /^\s+$/.test(t.value) ? (
          <span key={`${i}-o`} className="inline-block w-1.5" />
        ) : (
          <span key={`${i}-o`}>{t.value}</span>
        )
      )}

      {active && (
        <div
          role="dialog"
          aria-label={`Save ${active.word} to Anki`}
          className={`pointer-events-auto fixed z-[70] max-w-[min(18rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-[var(--line)] bg-ink px-3 py-2 shadow-glow ${
            active.place === "above" ? "-translate-y-full" : ""
          }`}
          style={{
            left: Math.min(
              Math.max(active.x, 88),
              (typeof window !== "undefined" ? window.innerWidth : 400) - 88
            ),
            top:
              active.place === "above"
                ? Math.max(active.y - 8, 56)
                : active.y,
          }}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="relative mb-0.5 flex items-start justify-center">
            <p className="text-center text-sm font-semibold text-paper">
              {active.word}
            </p>
            <button
              type="button"
              aria-label="Close"
              className="absolute -right-1 -top-1 min-h-8 min-w-8 rounded-full text-mist/60 hover:text-paper"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setActive(null);
              }}
            >
              ×
            </button>
          </div>
          <div className="mb-1.5 mt-1 space-y-0.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-mist/50">
              Meaning
            </p>
            <p className="text-xs text-mist">
              {active.en && active.en !== "…"
                ? active.en
                : infoOf(active.word).en || "…"}
            </p>
            <p className="pt-1 text-[10px] font-semibold uppercase tracking-wide text-mist/50">
              Pronunciation
            </p>
            <p className="text-[11px] italic text-citrus/90">
              {active.ipa || infoOf(active.word).ipa || "…"}
            </p>
          </div>
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
            className="min-h-10 w-full whitespace-nowrap rounded-full bg-citrus px-3 py-2 text-xs font-semibold text-ink hover:bg-citrus-dim disabled:opacity-50"
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
export const PRONUNCIATION_TOGGLE_KEY = "plume_pronunciation";

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

export function readPronunciationEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(PRONUNCIATION_TOGGLE_KEY);
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export function writePronunciationEnabled(on: boolean) {
  try {
    localStorage.setItem(PRONUNCIATION_TOGGLE_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}
