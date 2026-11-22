"use client";

type Props = {
  enabled: boolean;
  onChange: (next: boolean) => void;
  className?: string;
};

/** Clear on/off control for English under French (FL-12). */
export function GlossToggle({ enabled, onChange, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={
        enabled
          ? "English meanings on. Click to hide."
          : "English meanings off. Click to show."
      }
      onClick={() => onChange(!enabled)}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        enabled
          ? "border-citrus/50 bg-citrus/15 text-citrus"
          : "border-[var(--line)] bg-ink/40 text-mist hover:text-paper"
      } ${className || ""}`}
    >
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition ${
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
      <span>{enabled ? "EN + IPA under FR: On" : "EN + IPA under FR: Off"}</span>
    </button>
  );
}
