"use client";

type Props = {
  enabled: boolean;
  onChange: (next: boolean) => void;
  className?: string;
};

/** On/off for English sound-alike pronunciation (FL-13/15). */
export function PronunciationToggle({ enabled, onChange, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={
        enabled
          ? "Pronunciation on. Click to hide."
          : "Pronunciation off. Click to show."
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange(!enabled);
      }}
      className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition select-none ${
        enabled
          ? "border-citrus/50 bg-citrus/15 text-citrus"
          : "border-[var(--line)] bg-ink/40 text-mist hover:text-paper"
      } ${className || ""}`}
    >
      <span
        className={`pointer-events-none relative h-4 w-7 shrink-0 rounded-full transition ${
          enabled ? "bg-citrus" : "bg-mist/30"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-ink transition ${
            enabled ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
      <span className="pointer-events-none">
        {enabled ? "Pronunciation: On" : "Pronunciation: Off"}
      </span>
    </button>
  );
}
