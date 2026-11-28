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
 * Cinematic product walkthrough for the home hero —
 * action-cam energy: phone stage, step crossfades, live typing beat.
 */
export function ProductDemo() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % STEPS.length);
      setTick((t) => t + 1);
    }, 4200);
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
      {/* Outer cinematic frame */}
      <div className="relative w-full overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-gradient-to-b from-ink-3/80 to-ink-2 shadow-glow">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
          style={{
            background:
              "radial-gradient(600px 280px at 80% 0%, rgba(200,240,67,0.16), transparent 55%), radial-gradient(500px 240px at 10% 100%, rgba(255,143,107,0.1), transparent 50%)",
          }}
        />

        <div className="relative flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-ember/80 sm:h-2.5 sm:w-2.5" aria-hidden />
            <span className="h-2 w-2 shrink-0 rounded-full bg-citrus/70 sm:h-2.5 sm:w-2.5" aria-hidden />
            <span className="h-2 w-2 shrink-0 rounded-full bg-mist/40 sm:h-2.5 sm:w-2.5" aria-hidden />
            <span className="ml-1 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-mist/55 sm:ml-2 sm:text-[11px]">
              Live walkthrough
            </span>
          </div>
          <span className="shrink-0 rounded-full bg-citrus/15 px-2.5 py-0.5 text-[10px] font-semibold text-citrus">
            {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </span>
        </div>

        <div className="relative grid min-w-0 gap-0 md:grid-cols-[7rem_minmax(0,1fr)]">
          <ol className="grid grid-cols-5 gap-0.5 border-b border-[var(--line)] p-1.5 sm:gap-1 sm:p-2 md:flex md:flex-col md:border-b-0 md:border-r md:p-2.5">
            {STEPS.map((s, i) => (
              <li key={s.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setStep(i);
                    setTick((t) => t + 1);
                    setPaused(true);
                  }}
                  aria-current={i === step ? "step" : undefined}
                  className={`flex min-h-9 w-full flex-col items-center justify-center rounded-lg px-0.5 py-1.5 text-center transition duration-300 md:min-h-10 md:items-start md:rounded-xl md:px-2.5 md:py-2 md:text-left ${
                    i === step
                      ? "bg-citrus/20 font-semibold text-citrus ring-1 ring-citrus/35"
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

          <div className="relative flex min-h-0 min-w-0 flex-col p-3 sm:p-4 md:p-5">
            <p
              key={`cap-${tick}`}
              className="demo-fade mb-3 text-pretty text-sm leading-snug text-mist sm:mb-4 sm:leading-relaxed"
            >
              {current.caption}
            </p>

            {/* Phone / action stage */}
            <div className="relative mx-auto w-full max-w-[22rem] flex-1">
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-ink/70 p-2 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.85)] sm:p-2.5">
                <div className="mb-2 flex justify-center">
                  <span className="h-1 w-10 rounded-full bg-mist/25" aria-hidden />
                </div>
                <div className="min-h-[11rem] overflow-hidden rounded-[1.1rem] border border-[var(--line)] bg-[#07141c] p-3 sm:min-h-[12.5rem] sm:p-4">
                  <div key={`stage-${tick}`} className="demo-fade flex h-full min-h-[9.5rem] flex-col justify-center">
                    <DemoStage stepId={current.id} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 flex gap-1 sm:mt-4 sm:gap-1.5" aria-hidden>
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-mist/20`}
                >
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full bg-citrus transition-all duration-500 ${
                      i < step ? "w-full" : i === step ? "w-full animate-demo-progress" : "w-0"
                    }`}
                    style={i === step && !paused ? undefined : i === step ? { animation: "none" } : undefined}
                  />
                </span>
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
      <div className="w-full rounded-xl border border-[var(--line)] bg-[#f4fafb] px-3 py-3 text-sm leading-snug text-black sm:px-4 sm:text-base">
        <TypeBeat text="je want to le store avec mon friend" />
      </div>
    );
  }
  if (stepId === "rewrite") {
    return (
      <div className="w-full space-y-2 sm:space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-citrus/80">
          French · rewritten
        </p>
        <p className="brand-display text-pretty text-xl font-bold leading-snug text-citrus sm:text-2xl">
          Je veux aller au magasin avec mon ami.
        </p>
        <p className="text-pretty text-xs text-mist/55 line-through sm:text-sm">
          je want to le store avec mon friend
        </p>
      </div>
    );
  }
  if (stepId === "hover") {
    return (
      <div className="mx-auto w-full max-w-[15.5rem] space-y-2.5">
        <p className="text-center text-lg text-paper">
          <span className="rounded-sm bg-citrus/20 px-1 underline decoration-dotted decoration-citrus/70">
            magasin
          </span>
        </p>
        <div className="demo-pop rounded-xl border border-citrus/35 bg-ink px-3 py-2.5 text-center shadow-glow">
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
        <div className="demo-pop rounded-xl border border-citrus/35 bg-citrus/10 px-3 py-2.5 sm:px-4">
          <p className="text-pretty text-sm font-semibold text-citrus">
            Saved « magasin » → shop / store
          </p>
          <p className="mt-1 text-pretty text-xs text-mist">
            mah-gah-ZAN · Plume · Appris
          </p>
        </div>
        <div className="inline-flex rounded-full bg-citrus px-4 py-2 text-sm font-semibold text-ink">
          Save to Anki · Appris
        </div>
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 sm:gap-2.5">
      <div className="demo-pop max-w-[92%] rounded-2xl border border-[var(--line)] bg-ink/55 px-3 py-2.5 text-pretty text-sm leading-snug text-paper">
        Bonjour ! On peut parler en français — même si tu mélanges un peu
        d&apos;anglais.
      </div>
      <div className="demo-pop ml-auto max-w-[78%] rounded-2xl bg-citrus px-3 py-2.5 text-pretty text-sm font-medium leading-snug text-ink">
        Ça va bien, merci !
      </div>
    </div>
  );
}

function TypeBeat({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          window.clearInterval(id);
          return v;
        }
        return v + 1;
      });
    }, 38);
    return () => window.clearInterval(id);
  }, [text]);
  return (
    <span>
      {text.slice(0, n)}
      <span className="cursor-blink">|</span>
    </span>
  );
}

/** Home hero: brand + cinematic demo; practice tools sit below. */
export function ProductHero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-3 pb-5 pt-1 sm:px-6 sm:pb-8 sm:pt-3 lg:px-8 lg:pb-10 lg:pt-4">
      <div className="grid w-full min-w-0 items-start gap-5 sm:gap-7 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-10">
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
            Watch the walkthrough, then rewrite for real below — hover words for
            meaning and pronunciation, save to Anki, keep talking on Parler.
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
