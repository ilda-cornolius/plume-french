"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatPractice() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Bonjour ! Je suis Plume. On peut parler en français — même si tu mélanges un peu d'anglais. Comment ça va ?",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = useState<string>("local");
  const [hint, setHint] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => {
        setProvider(d.active || "local");
        if (!d.configured) {
          setHint(
            "GEMINI_API_KEY not set — local chat lines only. Add a free key from Google AI Studio."
          );
        }
      })
      .catch(() => setProvider("local"));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || pending) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Chat failed");
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data.reply || "…" },
        ]);
        if (data.provider) setProvider(data.provider);
        if (data.message) setHint(data.message);
      } catch {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "Désolé — je n'ai pas pu répondre. Réessaie dans un instant.",
          },
        ]);
      }
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col px-5 pb-16 pt-4 sm:px-8 sm:pt-8">
      <div className="mb-6 max-w-2xl animate-rise">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-citrus">
          Conversation
        </p>
        <h1 className="brand-display text-5xl font-extrabold text-paper sm:text-6xl">
          Talk with Plume.
        </h1>
        <p className="mt-3 text-lg text-mist sm:text-xl">
          Practice spoken-style French in a chat. Plume replies gently and
          nudges you forward.
        </p>
        <p className="mt-2 text-[11px] uppercase tracking-wide text-mist/50">
          Engine: {provider}
        </p>
      </div>

      <div className="panel-interactive flex min-h-[420px] flex-col rounded-2xl p-4 sm:p-5">
        <div className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "52vh" }}>
          {messages.map((m, i) => (
            <div
              key={`${i}-${m.role}`}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-base leading-relaxed sm:text-lg ${
                  m.role === "user"
                    ? "bg-citrus text-ink"
                    : "border border-[var(--line)] bg-ink/50 text-paper"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {pending && (
            <p className="text-xs text-mist/60">Plume écrit…</p>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Écris en français (ou Franglais)…"
            className="min-w-0 flex-1 rounded-full border border-[var(--line)] bg-[#f4fafb] px-5 py-3.5 text-lg text-black outline-none placeholder:text-black/40 focus:border-citrus/50"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="rounded-full bg-citrus px-6 py-3.5 text-base font-semibold text-ink hover:bg-citrus-dim disabled:opacity-40"
          >
            Envoyer
          </button>
        </form>
        {hint && <p className="mt-3 text-xs text-mist/70">{hint}</p>}
      </div>
    </section>
  );
}
