import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ankiDownloadCollection, ankiUploadCollection } from "@/lib/ankiweb";
import { addCardsToCollection, type LearnableCard } from "@/lib/anki-mutate";
import {
  COOKIE_NAME,
  decryptSession,
  type StoredAnkiSession,
} from "@/lib/session";

const cardSchema = z.object({
  front: z.string().min(1).max(2000),
  back: z.string().min(1).max(4000),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

const bodySchema = z.object({
  cards: z.array(cardSchema).min(1).max(40),
  deckName: z.string().min(1).max(120).optional(),
});

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  const session = token
    ? decryptSession<StoredAnkiSession>(token)
    : null;

  if (!session?.hkey) {
    return NextResponse.json(
      {
        error: "Connect AnkiWeb first to upload cards.",
        needsConnect: true,
      },
      { status: 401 }
    );
  }

  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid cards payload" }, { status: 400 });
    }

    const auth = { hkey: session.hkey, endpoint: session.endpoint };
    const downloaded = await ankiDownloadCollection(auth);
    const { bytes, added, deckName, deckId } = await addCardsToCollection(
      downloaded,
      parsed.data.cards as LearnableCard[],
      parsed.data.deckName || "Plume · Appris"
    );

    if (added === 0) {
      return NextResponse.json({ ok: true, added: 0, message: "No new cards to add." });
    }

    await ankiUploadCollection(auth, bytes);

    return NextResponse.json({
      ok: true,
      added,
      deckName,
      deckId,
      message: `Uploaded ${added} card(s) to « ${deckName} » on AnkiWeb.`,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AnkiWeb upload failed";
    const safe = message.replace(/password|passwd|hkey|key=/gi, "[redacted]");
    return NextResponse.json({ error: safe }, { status: 502 });
  }
}
