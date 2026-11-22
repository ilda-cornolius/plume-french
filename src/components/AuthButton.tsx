"use client";

import { useEffect, useState, useTransition } from "react";
import { signIn, signOut } from "next-auth/react";

type Status = {
  googleConfigured: boolean;
  signedIn: boolean;
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
};

export function AuthButton() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() =>
        setStatus({ googleConfigured: false, signedIn: false, user: null })
      );
  }, []);

  if (!status) {
    return (
      <span className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-mist/50">
        …
      </span>
    );
  }

  if (status.signedIn && status.user) {
    return (
      <div className="flex items-center gap-2">
        {status.user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={status.user.image}
            alt=""
            className="h-8 w-8 rounded-full border border-[var(--line)]"
            referrerPolicy="no-referrer"
          />
        )}
        <span className="hidden max-w-[8rem] truncate text-sm text-mist sm:inline">
          {status.user.name || status.user.email}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await signOut({ callbackUrl: "/" });
            })
          }
          className="rounded-full border border-[var(--line)] px-3 py-1.5 text-sm text-mist hover:text-paper disabled:opacity-40"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!status.googleConfigured) {
    return (
      <span
        className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-mist/60"
        title="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
      >
        Google login off
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signIn("google", { callbackUrl: "/" });
        })
      }
      className="rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-white disabled:opacity-40"
    >
      {pending ? "…" : "Google"}
    </button>
  );
}
