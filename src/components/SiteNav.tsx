"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LevelBadge } from "@/components/LevelBadge";
import { AuthButton } from "@/components/AuthButton";

const links = [
  { href: "/", label: "Écrire" },
  { href: "/chat", label: "Parler" },
  { href: "/decks", label: "Anki" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="brand-display text-[1.35rem] font-extrabold tracking-tight text-paper sm:text-3xl lg:text-4xl">
            Plume
          </span>
          <span className="hidden text-sm font-medium uppercase tracking-[0.2em] text-mist/70 sm:inline">
            français
          </span>
        </Link>
        <LevelBadge />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:flex-none sm:gap-3">
        <nav className="flex min-w-0 items-center gap-0.5 rounded-full border border-[var(--line)] bg-ink-2/50 p-0.5 backdrop-blur-md sm:gap-1 sm:p-1.5">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`min-h-9 shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium transition sm:min-h-10 sm:px-4 sm:py-2 sm:text-sm lg:px-5 lg:text-base ${
                  active
                    ? "bg-citrus text-ink"
                    : "text-mist hover:text-paper"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <AuthButton />
      </div>
    </header>
  );
}
