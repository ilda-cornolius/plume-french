"use client";

import { useEffect, useState } from "react";

type Step = {
  id: string;
  label: string;
  caption: string;
};

const STEPS: Step[] = [
  {
    id: "type",
    label: "Write",
    caption: "Type mixed French and English however it comes out.",
  },
  {
    id: "rewrite",
    label: "Rewrite",
    caption: "Plume returns clear French you can actually say.",
  },
  {
    id: "hover",
    label: "Hover",
    caption: "Tap any word for meaning and pronunciation.",
  },
  {
    id: "anki",
    label: "Save",
    caption: "Send words or phrases straight to Anki · Appris.",
  },
  {
    id: "chat",
    label: "Parler",
    caption: "Keep practicing in chat with the same gloss tips.",
  },
];

/**
 * Arcade-style interactive walkthrough for the home hero (right column).
 * Decorative demo only — real Écrire / Parler live below.
 */
export function ProductDemo() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % STEPS.length);
    }, 3800);
    return () => window.clearInterval(id);
  }, [paused]);

  const current = STEPS[step]!;

  return (
    <div
      className="animate-rise-delay"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-ink-2/90 shadow-glow">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ember/80" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-citrus/70" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-mist/40" aria-hidden />
          <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-mist/50">
            How Plume works
          </span>
        </div>

        <div className="grid gap-0 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
          <ol className="flex gap-1 overflow-x-auto border-b border-[var(--line)] p-2 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
            {STEPS.map((s, i) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setStep(i);
                    setPaused(true);
                  }}
                  aria-current={i === step ? "step" : undefined}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    i === step
                      ? "bg-citrus/15 font-semibold text-citrus"
                      : "text-mist hover:bg-ink/40 hover:text-paper"
                  }`}
                >
                  <span className="mr-1.5 text-[10px] text-mist/45">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.label}
                </button>
              </li>
            ))}
          </ol>

          <div className="relative min-h-[240px] p-4 sm:min-h-[280px] sm:p-5">
            <p className="mb-4 text-sm leading-relaxed text-mist">
              {current.caption}
            </p>
            <DemoStage stepId={current.id} />
            <div className="mt-4 flex gap-1.5" aria-hidden>
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1 flex-1 rounded-full transition ${
                    i === step ? "bg-citrus" : "bg-mist/20"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoStage({ stepId }: { stepId: string }) {
  if (stepId === "type") {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[#f4fafb] px-4 py-3 text-base text-black">
        <span className="cursor-blink">|</span>
        je want to le store avec mon friend
      </div>
    );
  }
  if (stepId === "rewrite") {
    return (
      <div className="space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist/60">
          French
        </p>
        <p className="brand-display text-2xl font-bold text-citrus sm:text-3xl">
          Je veux aller au magasin avec mon ami.
        </p>
        <p className="text-sm text-mist/60 line-through">
          je want to le store avec mon friend
        </p>
      </div>
    );
  }
  if (stepId === "hover") {
    return (
      <div className="relative inline-block rounded-xl border border-[var(--line)] bg-ink/60 px-4 py-3 text-paper">
        <span className="underline decoration-dotted decoration-citrus/60">
          magasin
        </span>
        <div className="absolute left-1/2 top-0 z-10 w-40 -translate-x-1/2 -translate-y-[105%] rounded-xl border border-[var(--line)] bg-ink px-3 py-2 text-center shadow-glow">
          <p className="text-sm font-semibold text-paper">magasin</p>
          <p className="text-[10px] uppercase tracking-wide text-mist/50">
            Meaning
          </p>
          <p className="text-xs text-mist">store / shop</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-mist/50">
            Pronunciation
          </p>
          <p className="text-[11px] italic text-citrus/90">mah-gah-ZAN</p>
        </div>
      </div>
    );
  }
  if (stepId === "anki") {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-citrus/30 bg-citrus/10 px-4 py-3">
          <p className="text-sm font-semibold text-citrus">
            Saved « magasin » → store / shop
          </p>
          <p className="mt-1 text-xs text-mist">
            Pronunciation: mah-gah-ZAN · deck Plume · Appris
          </p>
        </div>
        <button
          type="button"
          tabIndex={-1}
          className="rounded-full bg-citrus px-4 py-2 text-sm font-semibold text-ink"
        >
          Save to Anki · Appris
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="max-w-[90%] rounded-2xl border border-[var(--line)] bg-ink/50 px-4 py-3 text-sm text-paper">
        Bonjour ! On peut parler en français — même si tu mélanges un peu
        d&apos;anglais.
      </div>
      <div className="ml-auto max-w-[75%] rounded-2xl bg-citrus px-4 py-3 text-sm font-medium text-ink">
        Ça va bien, merci !
      </div>
    </div>
  );
}

/** Home hero: brand left, interactive demo right; practice tools sit below. */
export function ProductHero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-6 pt-2 sm:px-8 sm:pb-10 sm:pt-4">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
        <div className="animate-rise max-w-xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-citrus">
            Plume
          </p>
          <h1 className="brand-display text-5xl font-extrabold leading-[1.05] text-paper sm:text-6xl lg:text-7xl">
            Messy Franglais.
            <br />
            <span className="text-mist">Clear French.</span>
          </h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-mist sm:text-xl">
            Rewrite, hover for meaning and pronunciation, save to Anki, then
            keep talking on Parler.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#practice"
              className="inline-flex min-h-11 items-center rounded-full bg-citrus px-6 py-3 text-base font-semibold text-ink transition hover:bg-citrus-dim"
            >
              Start writing
            </a>
            <a
              href="/chat"
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--line)] px-6 py-3 text-base font-medium text-mist transition hover:border-citrus/40 hover:text-paper"
            >
              Open Parler
            </a>
          </div>
        </div>
        <ProductDemo />
      </div>
    </section>
  );
}
