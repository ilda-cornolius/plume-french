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
 * Arcade-style interactive walkthrough for the home hero.
 * Tuned for Galaxy Fold cover (~344px) and unfolded widths.
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
      className="animate-rise-delay w-full min-w-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className="w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-ink-2/90 shadow-glow">
        <div className="flex items-center gap-1.5 border-b border-[var(--line)] px-3 py-2 sm:gap-2 sm:px-4 sm:py-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-ember/80 sm:h-2.5 sm:w-2.5" aria-hidden />
          <span className="h-2 w-2 shrink-0 rounded-full bg-citrus/70 sm:h-2.5 sm:w-2.5" aria-hidden />
          <span className="h-2 w-2 shrink-0 rounded-full bg-mist/40 sm:h-2.5 sm:w-2.5" aria-hidden />
          <span className="ml-1 truncate text-[10px] font-medium uppercase tracking-wide text-mist/50 sm:ml-2 sm:text-[11px]">
            How Plume works
          </span>
        </div>

        {/* Cover: steps on top in 5 equal columns. md+: steps left rail. */}
        <div className="grid min-w-0 gap-0 md:grid-cols-[6.75rem_minmax(0,1fr)]">
          <ol className="grid grid-cols-5 gap-0.5 border-b border-[var(--line)] p-1.5 sm:gap-1 sm:p-2 md:flex md:flex-col md:border-b-0 md:border-r md:p-2.5">
            {STEPS.map((s, i) => (
              <li key={s.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setStep(i);
                    setPaused(true);
                  }}
                  aria-current={i === step ? "step" : undefined}
                  className={`flex min-h-9 w-full flex-col items-center justify-center rounded-lg px-0.5 py-1.5 text-center transition md:min-h-10 md:items-start md:rounded-xl md:px-2.5 md:py-2 md:text-left ${
                    i === step
                      ? "bg-citrus/15 font-semibold text-citrus"
                      : "text-mist hover:bg-ink/40 hover:text-paper"
                  }`}
                >
                  <span className="text-[9px] leading-none text-mist/45 md:mb-0.5 md:text-[10px]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="max-w-full truncate text-[10px] leading-tight sm:text-xs md:text-sm">
                    {s.label}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div className="relative flex min-h-0 min-w-0 flex-col p-3 sm:min-h-[260px] sm:p-4 md:p-5">
            <p className="mb-3 text-pretty text-sm leading-snug text-mist sm:mb-4 sm:leading-relaxed">
              {current.caption}
            </p>
            <div className="flex min-h-[9.5rem] flex-1 flex-col justify-center sm:min-h-[11rem]">
              <DemoStage stepId={current.id} />
            </div>
            <div className="mt-3 flex gap-1 sm:mt-4 sm:gap-1.5" aria-hidden>
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1 min-w-0 flex-1 rounded-full transition ${
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
      <div className="w-full rounded-xl border border-[var(--line)] bg-[#f4fafb] px-3 py-2.5 text-sm leading-snug text-black sm:px-4 sm:py-3 sm:text-base">
        <span className="cursor-blink">|</span>
        <span className="break-words">
          je want to le store avec mon friend
        </span>
      </div>
    );
  }
  if (stepId === "rewrite") {
    return (
      <div className="w-full space-y-2 sm:space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist/60">
          French
        </p>
        <p className="brand-display text-pretty text-xl font-bold leading-snug text-citrus sm:text-2xl md:text-3xl">
          Je veux aller au magasin avec mon ami.
        </p>
        <p className="text-pretty text-xs text-mist/60 line-through sm:text-sm">
          je want to le store avec mon friend
        </p>
      </div>
    );
  }
  if (stepId === "hover") {
    // Inline card (no absolute popover) so Fold cover never clips off-center
    return (
      <div className="mx-auto w-full max-w-[16rem] space-y-2">
        <p className="text-center text-paper">
          <span className="underline decoration-dotted decoration-citrus/60">
            magasin
          </span>
        </p>
        <div className="rounded-xl border border-[var(--line)] bg-ink px-3 py-2.5 text-center shadow-glow">
          <p className="text-sm font-semibold text-paper">magasin</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-mist/50">
            Meaning
          </p>
          <p className="text-xs text-mist">shop / store</p>
          <p className="mt-1.5 text-[10px] uppercase tracking-wide text-mist/50">
            Pronunciation
          </p>
          <p className="text-[11px] italic text-citrus/90">mah-gah-ZAN</p>
        </div>
      </div>
    );
  }
  if (stepId === "anki") {
    return (
      <div className="w-full space-y-2.5 sm:space-y-3">
        <div className="rounded-xl border border-citrus/30 bg-citrus/10 px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-pretty text-sm font-semibold text-citrus">
            Saved « magasin » → shop / store
          </p>
          <p className="mt-1 text-pretty text-xs text-mist">
            Pronunciation: mah-gah-ZAN · Plume · Appris
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
    <div className="flex w-full flex-col gap-2 sm:gap-3">
      <div className="max-w-[92%] rounded-2xl border border-[var(--line)] bg-ink/50 px-3 py-2.5 text-pretty text-sm leading-snug text-paper sm:px-4 sm:py-3">
        Bonjour ! On peut parler en français — même si tu mélanges un peu
        d&apos;anglais.
      </div>
      <div className="ml-auto max-w-[78%] rounded-2xl bg-citrus px-3 py-2.5 text-pretty text-sm font-medium leading-snug text-ink sm:px-4 sm:py-3">
        Ça va bien, merci !
      </div>
    </div>
  );
}

/** Home hero: brand + demo; practice tools sit below. */
export function ProductHero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-3 pb-5 pt-1 sm:px-6 sm:pb-8 sm:pt-3 lg:px-8 lg:pb-10 lg:pt-4">
      <div className="grid w-full min-w-0 items-start gap-5 sm:gap-7 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-10">
        <div className="animate-rise w-full min-w-0 max-w-xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-citrus sm:mb-3 sm:text-sm">
            Plume
          </p>
          <h1 className="brand-display text-balance text-[2.15rem] font-extrabold leading-[1.1] text-paper sm:text-5xl md:text-6xl lg:text-7xl">
            Messy Franglais.
            <br />
            <span className="text-mist">Clear French.</span>
          </h1>
          <p className="mt-3 max-w-md text-pretty text-[0.95rem] leading-relaxed text-mist sm:mt-4 sm:text-lg lg:text-xl">
            Rewrite, hover for meaning and pronunciation, save to Anki, then
            keep talking on Parler.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5 sm:mt-6 sm:gap-3">
            <a
              href="#practice"
              className="inline-flex min-h-11 items-center rounded-full bg-citrus px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-citrus-dim sm:px-6 sm:py-3 sm:text-base"
            >
              Start writing
            </a>
            <a
              href="/chat"
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-medium text-mist transition hover:border-citrus/40 hover:text-paper sm:px-6 sm:py-3 sm:text-base"
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
