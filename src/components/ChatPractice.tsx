"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  HoverSaveWords,
  readGlossEnabled,
  writeGlossEnabled,
  readPronunciationEnabled,
  writePronunciationEnabled,
} from "@/components/HoverSaveWords";
import { GlossToolbar } from "@/components/GlossToolbar";

type Msg = { role: "user" | "assistant"; content: string };

type ConvSummary = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string | null;
};

const GREETING: Msg = {
  role: "assistant",
  content:
    "Bonjour ! Je suis Plume. On peut parler en français — même si tu mélanges un peu d'anglais. Comment ça va ?",
};

export function ChatPractice() {
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = useState<string>("local");
  const [hint, setHint] = useState<string | null>(null);
  const [ankiHint, setAnkiHint] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [history, setHistory] = useState<ConvSummary[]>([]);
  const [ownerLabel, setOwnerLabel] = useState<string>("This browser");
  const [hydrating, setHydrating] = useState(true);
  const [glossOn, setGlossOn] = useState(true);
  const [pronOn, setPronOn] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setGlossOn(readGlossEnabled());
    setPronOn(readPronunciationEnabled());
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations?kind=chat", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ownerLabel) setOwnerLabel(data.ownerLabel);
      setHistory(
        (data.conversations || []).map(
          (c: {
            id: string;
            title: string;
            updatedAt: string;
            preview: string | null;
          }) => ({
            id: c.id,
            title: c.title,
            updatedAt: c.updatedAt,
            preview: c.preview,
          })
        )
      );
    } catch {
      // ignore
    }
  }, []);

  const persistMessages = useCallback(
    async (id: string, msgs: Msg[]) => {
      try {
        await fetch(`/api/conversations/${id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: msgs.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        void refreshHistory();
      } catch {
        // ignore persist errors in UI
      }
    },
    [refreshHistory]
  );

  const schedulePersist = useCallback(
    (id: string, msgs: Msg[]) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        void persistMessages(id, msgs);
      }, 400);
    },
    [persistMessages]
  );

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;
    const res = await fetch("/api/conversations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "chat" }),
    });
    const data = await res.json();
    const id = data.conversation?.id as string;
    setConversationId(id);
    return id;
  }, [conversationId]);

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
    let cancelled = false;
    // Always clear the banner even if Strict Mode cancels the first run
    const safety = setTimeout(() => setHydrating(false), 2500);

    (async () => {
      setHydrating(true);
      try {
        const listRes = await fetch("/api/conversations?kind=chat", {
          credentials: "include",
        });
        const listData = await listRes.json();
        if (cancelled) return;
        if (listData.ownerLabel) setOwnerLabel(listData.ownerLabel);
        const items: ConvSummary[] = (listData.conversations || []).map(
          (c: ConvSummary) => c
        );
        setHistory(items);

        if (items[0]) {
          const detailRes = await fetch(
            `/api/conversations/${items[0].id}`,
            { credentials: "include" }
          );
          const detail = await detailRes.json();
          if (cancelled) return;
          const conv = detail.conversation;
          if (conv?.id) {
            setConversationId(conv.id);
            const restored: Msg[] = (conv.messages || [])
              .filter(
                (m: { role: string }) =>
                  m.role === "user" || m.role === "assistant"
              )
              .map((m: { role: "user" | "assistant"; content: string }) => ({
                role: m.role,
                content: m.content,
              }));
            setMessages(restored.length ? restored : [GREETING]);
          }
        } else {
          const createRes = await fetch("/api/conversations", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "chat" }),
          });
          const created = await createRes.json();
          if (cancelled) return;
          if (created.conversation?.id) {
            setConversationId(created.conversation.id);
            void persistMessages(created.conversation.id, [GREETING]);
          }
        }
      } catch {
        // stay on greeting
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safety);
      setHydrating(false);
    };
    // Restore once on mount — do not re-run when persist helpers change identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function startNewChat() {
    setMessages([GREETING]);
    setAnkiHint(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "chat" }),
      });
      const data = await res.json();
      const id = data.conversation?.id as string | undefined;
      if (id) {
        setConversationId(id);
        await persistMessages(id, [GREETING]);
        await refreshHistory();
      }
    } catch {
      setConversationId(null);
    }
  }

  async function openConversation(id: string) {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        credentials: "include",
      });
      const data = await res.json();
      const conv = data.conversation;
      if (!conv) return;
      setConversationId(conv.id);
      const restored: Msg[] = (conv.messages || [])
        .filter(
          (m: { role: string }) => m.role === "user" || m.role === "assistant"
        )
        .map((m: { role: "user" | "assistant"; content: string }) => ({
          role: m.role,
          content: m.content,
        }));
      setMessages(restored.length ? restored : [GREETING]);
      setAnkiHint(null);
    } catch {
      // ignore
    }
  }

  async function removeConversation(id: string) {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (conversationId === id) {
        await startNewChat();
      } else {
        await refreshHistory();
      }
    } catch {
      // ignore
    }
  }

  function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || pending) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    startTransition(async () => {
      let id = conversationId;
      try {
        id = await ensureConversation();
        schedulePersist(id, next);
      } catch {
        // continue chat even if create fails
      }

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
        const withReply: Msg[] = [
          ...next,
          { role: "assistant", content: data.reply || "…" },
        ];
        setMessages(withReply);
        if (id) schedulePersist(id, withReply);
        if (data.provider) setProvider(data.provider);
        if (data.message) setHint(data.message);
      } catch {
        const fail: Msg[] = [
          ...next,
          {
            role: "assistant",
            content:
              "Désolé — je n'ai pas pu répondre. Réessaie dans un instant.",
          },
        ];
        setMessages(fail);
        if (id) schedulePersist(id, fail);
      }
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-16 pt-4 sm:px-8 sm:pt-8">
      <div className="mb-6 max-w-2xl animate-rise">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-citrus">
          Conversation
        </p>
        <h1 className="brand-display text-5xl font-extrabold text-paper sm:text-6xl">
          Talk with Plume.
        </h1>
        <p className="mt-3 text-lg text-mist sm:text-xl">
          Practice spoken-style French in a chat. Hover any word for meaning and
          pronunciation; toggles keep EN / say-it under words. Chats persist for{" "}
          <span className="text-paper">{ownerLabel}</span>.
        </p>
        <p className="mt-2 text-[11px] uppercase tracking-wide text-mist/50">
          Engine: {provider}
          {hydrating ? " · restoring…" : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="panel-interactive flex max-h-[70vh] flex-col rounded-2xl p-3">
          <button
            type="button"
            onClick={() => void startNewChat()}
            className="mb-3 w-full rounded-full bg-citrus px-3 py-2 text-sm font-semibold text-ink hover:bg-citrus-dim"
          >
            New chat
          </button>
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-mist/50">
            Past chats
          </p>
          <ul className="flex-1 space-y-1 overflow-y-auto">
            {history.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  type="button"
                  onClick={() => void openConversation(c.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    c.id === conversationId
                      ? "bg-citrus/15 text-paper"
                      : "text-mist hover:bg-ink/40 hover:text-paper"
                  }`}
                >
                  <span className="line-clamp-2 font-medium">{c.title}</span>
                </button>
                <button
                  type="button"
                  aria-label="Delete chat"
                  onClick={() => void removeConversation(c.id)}
                  className="absolute right-1 top-1 hidden rounded px-1.5 text-xs text-mist/50 hover:text-ember group-hover:block"
                >
                  ×
                </button>
              </li>
            ))}
            {!history.length && (
              <li className="px-2 py-3 text-xs text-mist/50">No past chats yet.</li>
            )}
          </ul>
        </aside>

        <div className="panel-chat relative z-10 flex h-[min(70vh,720px)] min-h-[420px] flex-col overflow-hidden rounded-2xl p-4 sm:p-5 [transform:translateZ(0)]">
          <GlossToolbar
            className="mb-3 shrink-0 border-b border-[var(--line)] pb-3"
            glossOn={glossOn}
            pronOn={pronOn}
            onGlossChange={(on) => {
              setGlossOn(on);
              writeGlossEnabled(on);
            }}
            onPronChange={(on) => {
              setPronOn(on);
              writePronunciationEnabled(on);
            }}
          />
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
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
                  <HoverSaveWords
                    text={m.content}
                    glossEnabled={glossOn}
                    pronunciationEnabled={pronOn}
                    tone={m.role === "user" ? "on-light" : "on-dark"}
                    onSaved={(_w, msg) => setAnkiHint(msg)}
                    onError={(msg) => setAnkiHint(msg)}
                  />
                </div>
              </div>
            ))}
            {pending && (
              <p className="text-xs text-mist/60">Plume écrit…</p>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="relative z-50 mt-4 flex shrink-0 flex-wrap gap-2 border-t border-[var(--line)] bg-[#0c2430] pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              ref={inputRef}
              id="plume-chat-input"
              name="message"
              rows={1}
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck
              enterKeyHint="send"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              onPointerDown={(e) => {
                // Cursor embedded browser: force focus; keep above word popovers
                e.stopPropagation();
                const el = e.currentTarget;
                requestAnimationFrame(() => {
                  el.focus({ preventScroll: true });
                });
              }}
              placeholder="Écris en français (ou Franglais)…"
              className="pointer-events-auto relative z-50 min-h-[3.25rem] min-w-0 flex-1 resize-none touch-manipulation select-text rounded-[1.75rem] border border-[var(--line)] bg-[#f4fafb] px-5 py-3.5 text-lg leading-snug text-black outline-none placeholder:text-black/40 focus:border-citrus/50"
              style={{ WebkitUserSelect: "text", userSelect: "text" }}
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="relative z-50 touch-manipulation self-end rounded-full bg-citrus px-6 py-3.5 text-base font-semibold text-ink hover:bg-citrus-dim disabled:opacity-40"
            >
              Envoyer
            </button>
          </form>
          {hint && <p className="mt-3 text-xs text-mist/70">{hint}</p>}
          {ankiHint && (
            <p className="mt-2 text-xs text-citrus" role="status">
              {ankiHint}
            </p>
          )}
          <p className="mt-2 text-[11px] text-mist/45">
            Tip: hover a word → meaning + pronunciation + Save to Anki · Appris.
            EN / Pronunciation toggles keep tips under words (synced with Écrire).
          </p>
        </div>
      </div>
    </section>
  );
}
