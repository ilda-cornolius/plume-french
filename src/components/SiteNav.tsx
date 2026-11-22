"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LevelBadge } from "@/components/LevelBadge";

const links = [
  { href: "/", label: "Écrire" },
  { href: "/chat", label: "Parler" },
  { href: "/decks", label: "Anki" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
      <div className="flex items-center gap-3">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="brand-display text-2xl font-extrabold tracking-tight text-paper sm:text-3xl">
            Plume
          </span>
          <span className="hidden text-xs font-medium uppercase tracking-[0.2em] text-mist/70 sm:inline">
            français
          </span>
        </Link>
        <LevelBadge />
      </div>
      <nav className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-ink-2/50 p-1 backdrop-blur-md">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition sm:px-4 ${
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
    </header>
  );
}
