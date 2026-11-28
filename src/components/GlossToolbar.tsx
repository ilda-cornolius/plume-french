"use client";

import { GlossToggle } from "@/components/GlossToggle";
import { PronunciationToggle } from "@/components/PronunciationToggle";

type Props = {
  glossOn: boolean;
  pronOn: boolean;
  onGlossChange: (on: boolean) => void;
  onPronChange: (on: boolean) => void;
  /** Optional short context line (defaults to shared tip). */
  hint?: string | null;
  className?: string;
};

/**
 * Shared EN + Pronunciation controls used on Écrire and Parler
 * so both match the main-page phonetic/definition UX.
 */
export function GlossToolbar({
  glossOn,
  pronOn,
  onGlossChange,
  onPronChange,
  hint,
  className,
}: Props) {
  const tip =
    hint === null
      ? null
      : hint ??
        (pronOn
          ? "Say-it under words (dire → deer) · hover a word to save to Anki"
          : "Pronunciation tips hidden · hover a word to save to Anki");

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className || ""}`}
      data-testid="gloss-toolbar"
    >
      <GlossToggle enabled={glossOn} onChange={onGlossChange} />
      <PronunciationToggle enabled={pronOn} onChange={onPronChange} />
      {tip ? <p className="text-[11px] text-mist/45">{tip}</p> : null}
    </div>
  );
}
