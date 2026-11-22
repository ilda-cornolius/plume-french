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
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8 sm:py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="brand-display text-3xl font-extrabold tracking-tight text-paper sm:text-4xl">
            Plume
          </span>
          <span className="hidden text-sm font-medium uppercase tracking-[0.2em] text-mist/70 sm:inline">
            français
          </span>
        </Link>
        <LevelBadge />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <nav className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-ink-2/50 p-1.5 backdrop-blur-md">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3.5 py-2 text-base font-medium transition sm:px-5 ${
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
