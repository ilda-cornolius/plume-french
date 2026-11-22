"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { AnkiCollectionData } from "@/lib/ankiweb";

type SyncResponse = {
  connected: boolean;
  demo: boolean;
  username: string | null;
  connectedAt?: string;
  collection: AnkiCollectionData;
  message: string;
  error?: string;
};

export function AnkiSyncPanel() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState<SyncResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/anki/sync");
        const json = (await res.json()) as SyncResponse;
        setData(json);
        if (!selectedDeck && json.collection.decks[0]) {
          setSelectedDeck(json.collection.decks[0].name);
        }
      } catch {
        setFormError("Could not load decks.");
      }
    });
  }, [selectedDeck]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setConnecting(true);
    try {
      const res = await fetch("/api/anki/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      // Clear password from memory/UI immediately
      setPassword("");
      if (!res.ok) {
        setFormError(json.error || "Connection failed");
        return;
      }
      setUsername(json.username || username);
      refresh();
    } catch {
      setFormError("Could not reach AnkiWeb connect endpoint.");
      setPassword("");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    setFormError(null);
    await fetch("/api/anki/disconnect", { method: "POST" });
    setSelectedDeck(null);
    refresh();
  }

  const notes =
    data?.collection.notes.filter((n) =>
      selectedDeck ? n.deckName === selectedDeck : true
    ) ?? [];

  return (
    <section className="mx-auto w-full max-w-5xl px-5 pb-20 pt-4 sm:px-8 sm:pt-8">
      <div className="mb-8 max-w-2xl animate-rise">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-citrus">
          AnkiWeb
        </p>
        <h1 className="brand-display text-4xl font-extrabold text-paper sm:text-5xl">
          Your decks, nearby.
        </h1>
        <p className="mt-3 text-base text-mist sm:text-lg">
          Sign in with AnkiWeb to download deck and note info. Credentials stay
          in an encrypted httpOnly cookie — passwords are never logged.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="panel-interactive animate-rise-delay rounded-2xl p-5 sm:p-6">
          {data?.connected ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mist">
                  Connected
                </p>
                <p className="mt-1 text-lg font-semibold text-paper">
                  {data.username}
                </p>
                {data.connectedAt && (
                  <p className="text-xs text-mist/60">
                    Since {new Date(data.connectedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={refresh}
                  disabled={pending}
                  className="rounded-full bg-citrus px-5 py-2 text-sm font-semibold text-ink hover:bg-citrus-dim disabled:opacity-40"
                >
                  {pending ? "Refreshing…" : "Refresh sync"}
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  className="rounded-full border border-[var(--line)] px-5 py-2 text-sm text-mist hover:text-paper"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={connect} className="space-y-4" autoComplete="on">
              <div>
                <label
                  htmlFor="anki-user"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-mist"
                >
                  AnkiWeb email / username
                </label>
                <input
                  id="anki-user"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--line)] bg-[#f4fafb] px-3 py-2.5 text-black outline-none placeholder:text-black/40 focus:border-citrus/50"
                />
              </div>
              <div>
                <label
                  htmlFor="anki-pass"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-mist"
                >
                  Password
                </label>
                <input
                  id="anki-pass"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--line)] bg-[#f4fafb] px-3 py-2.5 text-black outline-none placeholder:text-black/40 focus:border-citrus/50"
                />
              </div>
              <button
                type="submit"
                disabled={connecting}
                className="rounded-full bg-citrus px-5 py-2.5 text-sm font-semibold text-ink hover:bg-citrus-dim disabled:opacity-40"
              >
                {connecting ? "Connecting…" : "Connect AnkiWeb"}
              </button>
            </form>
          )}

          {formError && (
            <p className="mt-4 text-sm text-ember" role="alert">
              {formError}
            </p>
          )}

          {data?.message && (
            <p
              className={`mt-4 text-sm ${
                data.demo ? "text-ember" : "text-mist"
              }`}
            >
              {data.demo && (
                <span className="mr-2 rounded-full bg-ember/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ember">
                  Demo data
                </span>
              )}
              {data.message}
            </p>
          )}
        </div>

        <div className="animate-rise-late space-y-4">
          <div className="flex flex-wrap gap-2">
            {(data?.collection.decks ?? []).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDeck(d.name)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  selectedDeck === d.name
                    ? "border-citrus bg-citrus/15 text-citrus"
                    : "border-[var(--line)] text-mist hover:text-paper"
                }`}
              >
                {d.name}
                <span className="ml-2 text-xs opacity-60">{d.cardCount}</span>
              </button>
            ))}
          </div>

          <ul className="space-y-2">
            {notes.slice(0, 40).map((n) => (
              <li
                key={n.id}
                className="panel-interactive rounded-xl px-4 py-3"
              >
                <p className="font-medium text-paper">
                  {n.fields[0] || "(empty)"}
                </p>
                {n.fields[1] && (
                  <p className="mt-1 text-sm text-mist">{n.fields[1]}</p>
                )}
                {n.tags.length > 0 && (
                  <p className="mt-2 text-[11px] text-mist/50">
                    {n.tags.join(" · ")}
                  </p>
                )}
              </li>
            ))}
            {notes.length === 0 && (
              <li className="text-sm text-mist">No notes in this deck.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
