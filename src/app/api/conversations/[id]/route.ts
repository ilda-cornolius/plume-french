import { z } from "zod";
import { withOwner, jsonWithOwner } from "@/lib/api-owner";
import {
  deleteConversation,
  getConversation,
  replaceMessages,
} from "@/lib/conversations";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const owner = await withOwner(request);
  const { id } = await ctx.params;
  try {
    const conversation = await getConversation(owner.ownerId, id);
    if (!conversation) {
      return jsonWithOwner({ error: "Not found" }, owner, { status: 404 });
    }
    return jsonWithOwner({ conversation, ownerLabel: owner.label }, owner);
  } catch (e) {
    return jsonWithOwner(
      { error: e instanceof Error ? e.message : "Failed to load" },
      owner,
      { status: 500 }
    );
  }
}

const putSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(0).max(8000),
        meta: z.record(z.string(), z.unknown()).nullable().optional(),
      })
    )
    .max(80),
});

export async function PUT(request: Request, ctx: Ctx) {
  const owner = await withOwner(request);
  const { id } = await ctx.params;
  try {
    const json = await request.json();
    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      return jsonWithOwner({ error: "Invalid messages" }, owner, {
        status: 400,
      });
    }
    const conversation = await replaceMessages(
      owner.ownerId,
      id,
      parsed.data.messages.map((m) => ({
        role: m.role,
        content: m.content,
        meta: m.meta ?? null,
      }))
    );
    if (!conversation) {
      return jsonWithOwner({ error: "Not found" }, owner, { status: 404 });
    }
    return jsonWithOwner({ conversation }, owner);
  } catch (e) {
    return jsonWithOwner(
      { error: e instanceof Error ? e.message : "Failed to save" },
      owner,
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const owner = await withOwner(request);
  const { id } = await ctx.params;
  try {
    const ok = await deleteConversation(owner.ownerId, id);
    if (!ok) {
      return jsonWithOwner({ error: "Not found" }, owner, { status: 404 });
    }
    return jsonWithOwner({ ok: true }, owner);
  } catch (e) {
    return jsonWithOwner(
      { error: e instanceof Error ? e.message : "Failed to delete" },
      owner,
      { status: 500 }
    );
  }
}
