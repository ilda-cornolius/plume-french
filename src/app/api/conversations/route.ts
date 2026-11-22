import { z } from "zod";
import { withOwner, jsonWithOwner } from "@/lib/api-owner";
import {
  createConversation,
  listConversations,
  type ConversationKind,
} from "@/lib/conversations";

export async function GET(request: Request) {
  const owner = await withOwner(request);
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kind =
    kindParam === "chat" || kindParam === "writing"
      ? (kindParam as ConversationKind)
      : undefined;

  try {
    const items = await listConversations(owner.ownerId, kind);
    return jsonWithOwner(
      { conversations: items, ownerLabel: owner.label },
      owner
    );
  } catch (e) {
    return jsonWithOwner(
      {
        error: e instanceof Error ? e.message : "Failed to list conversations",
        conversations: [],
      },
      owner,
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  kind: z.enum(["chat", "writing"]),
  title: z.string().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  const owner = await withOwner(request);
  try {
    const json = await request.json();
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return jsonWithOwner({ error: "Invalid body" }, owner, { status: 400 });
    }
    const conversation = await createConversation(
      owner.ownerId,
      parsed.data.kind,
      parsed.data.title
    );
    return jsonWithOwner({ conversation, ownerLabel: owner.label }, owner);
  } catch (e) {
    return jsonWithOwner(
      {
        error: e instanceof Error ? e.message : "Failed to create conversation",
      },
      owner,
      { status: 500 }
    );
  }
}
