-- Conversation persistence for Parler chat and writing practice (FL-10)

create table if not exists conversations (
  id text primary key,
  owner_id text not null,
  kind text not null check (kind in ('chat', 'writing')),
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_owner_updated_idx
  on conversations (owner_id, updated_at desc);

create table if not exists conversation_messages (
  id text primary key,
  conversation_id text not null references conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_conv_created_idx
  on conversation_messages (conversation_id, created_at);
