import { sql } from "@/lib/db";

export type ConversationKind = "chat" | "writing";

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  preview: string | null;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: ConversationMessage[];
};

type ConvRow = {
  id: string;
  kind: string;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
  preview?: string | null;
};

type MsgRow = {
  id: string;
  role: string;
  content: string;
  meta: Record<string, unknown> | null;
  created_at: Date | string;
};

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function normalizeMeta(
  meta: unknown
): Record<string, unknown> | null {
  if (meta == null) return null;
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof meta === "object") return meta as Record<string, unknown>;
  return null;
}

function titleFromMessages(
  kind: ConversationKind,
  messages: { role: string; content: string }[]
): string {
  const firstUser = messages.find((m) => m.role === "user")?.content?.trim();
  if (!firstUser) {
    return kind === "writing" ? "Writing practice" : "New chat";
  }
  const oneLine = firstUser.replace(/\s+/g, " ").slice(0, 48);
  return oneLine.length < firstUser.replace(/\s+/g, " ").length
    ? `${oneLine}…`
    : oneLine;
}

export async function listConversations(
  ownerId: string,
  kind?: ConversationKind,
  limit = 40
): Promise<ConversationSummary[]> {
  const rows = kind
    ? await sql<ConvRow>(
        `select c.id, c.kind, c.title, c.created_at, c.updated_at,
           (select m.content from conversation_messages m
             where m.conversation_id = c.id
             order by m.created_at desc limit 1) as preview
         from conversations c
         where c.owner_id = $1 and c.kind = $2
         order by c.updated_at desc
         limit $3`,
        [ownerId, kind, limit]
      )
    : await sql<ConvRow>(
        `select c.id, c.kind, c.title, c.created_at, c.updated_at,
           (select m.content from conversation_messages m
             where m.conversation_id = c.id
             order by m.created_at desc limit 1) as preview
         from conversations c
         where c.owner_id = $1
         order by c.updated_at desc
         limit $2`,
        [ownerId, limit]
      );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ConversationKind,
    title: r.title,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    preview: r.preview ? String(r.preview).slice(0, 120) : null,
  }));
}

export async function getConversation(
  ownerId: string,
  id: string
): Promise<ConversationDetail | null> {
  const rows = await sql<ConvRow>(
    `select id, kind, title, created_at, updated_at
     from conversations where id = $1 and owner_id = $2 limit 1`,
    [id, ownerId]
  );
  if (!rows[0]) return null;
  const c = rows[0];
  const msgs = await sql<MsgRow>(
    `select id, role, content, meta, created_at
     from conversation_messages
     where conversation_id = $1
     order by created_at asc`,
    [id]
  );
  return {
    id: c.id,
    kind: c.kind as ConversationKind,
    title: c.title,
    createdAt: iso(c.created_at),
    updatedAt: iso(c.updated_at),
    preview: msgs.length ? msgs[msgs.length - 1].content.slice(0, 120) : null,
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role as ConversationMessage["role"],
      content: m.content,
      meta: normalizeMeta(m.meta),
      createdAt: iso(m.created_at),
    })),
  };
}

export async function createConversation(
  ownerId: string,
  kind: ConversationKind,
  title?: string
): Promise<ConversationDetail> {
  const id = crypto.randomUUID();
  const t = title || (kind === "writing" ? "Writing practice" : "New chat");
  await sql(
    `insert into conversations (id, owner_id, kind, title)
     values ($1, $2, $3, $4)`,
    [id, ownerId, kind, t]
  );
  return {
    id,
    kind,
    title: t,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    preview: null,
    messages: [],
  };
}

/** Replace all messages for a conversation (owner-scoped). */
export async function replaceMessages(
  ownerId: string,
  conversationId: string,
  messages: {
    role: "user" | "assistant" | "system";
    content: string;
    meta?: Record<string, unknown> | null;
  }[]
): Promise<ConversationDetail | null> {
  const existing = await sql<{ id: string; kind: string }>(
    `select id, kind from conversations where id = $1 and owner_id = $2`,
    [conversationId, ownerId]
  );
  if (!existing[0]) return null;

  const kind = existing[0].kind as ConversationKind;
  const title = titleFromMessages(kind, messages);

  await sql(`delete from conversation_messages where conversation_id = $1`, [
    conversationId,
  ]);

  for (const m of messages) {
    const mid = crypto.randomUUID();
    await sql(
      `insert into conversation_messages (id, conversation_id, role, content, meta)
       values ($1, $2, $3, $4, $5)`,
      [
        mid,
        conversationId,
        m.role,
        m.content,
        m.meta ? JSON.stringify(m.meta) : null,
      ]
    );
  }

  await sql(
    `update conversations set title = $1, updated_at = now() where id = $2`,
    [title, conversationId]
  );

  return getConversation(ownerId, conversationId);
}

export async function appendMessages(
  ownerId: string,
  conversationId: string,
  messages: {
    role: "user" | "assistant" | "system";
    content: string;
    meta?: Record<string, unknown> | null;
  }[]
): Promise<ConversationDetail | null> {
  const existing = await sql<{ id: string; kind: string; title: string }>(
    `select id, kind, title from conversations where id = $1 and owner_id = $2`,
    [conversationId, ownerId]
  );
  if (!existing[0]) return null;

  for (const m of messages) {
    await sql(
      `insert into conversation_messages (id, conversation_id, role, content, meta)
       values ($1, $2, $3, $4, $5)`,
      [
        crypto.randomUUID(),
        conversationId,
        m.role,
        m.content,
        m.meta ? JSON.stringify(m.meta) : null,
      ]
    );
  }

  const detail = await getConversation(ownerId, conversationId);
  if (!detail) return null;

  if (existing[0].title === "New chat" || existing[0].title === "Writing practice") {
    const title = titleFromMessages(
      existing[0].kind as ConversationKind,
      detail.messages
    );
    await sql(
      `update conversations set title = $1, updated_at = now() where id = $2`,
      [title, conversationId]
    );
    detail.title = title;
  } else {
    await sql(`update conversations set updated_at = now() where id = $1`, [
      conversationId,
    ]);
  }

  return detail;
}

export async function deleteConversation(
  ownerId: string,
  id: string
): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    `delete from conversations where id = $1 and owner_id = $2 returning id`,
    [id, ownerId]
  );
  return rows.length > 0;
}
