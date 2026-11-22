import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import path from "path";
import fs from "fs";
import { createHash, randomBytes } from "crypto";

export type LearnableCard = {
  front: string;
  back: string;
  tags?: string[];
};

let sqlPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => {
        const candidate = path.join(
          process.cwd(),
          "node_modules",
          "sql.js",
          "dist",
          file
        );
        if (fs.existsSync(candidate)) return candidate;
        return `https://sql.js.org/dist/${file}`;
      },
      useOldExtensionFunctions: false,
    } as Parameters<typeof initSqlJs>[0]);
  }
  return sqlPromise;
}

function fieldChecksum(sfld: string): number {
  // Anki uses first 8 hex digits of sha1 of the sort field as int
  const hex = createHash("sha1").update(sfld, "utf8").digest("hex").slice(0, 8);
  return parseInt(hex, 16);
}

function makeGuid(): string {
  // Anki-style base91-ish short guid; random base64url works for uniqueness
  return randomBytes(8).toString("base64url").slice(0, 10);
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

type DeckMap = Record<string, { id: number | string; name: string; [k: string]: unknown }>;
type ModelMap = Record<
  string,
  {
    id: number | string;
    name: string;
    flds?: { name: string }[];
    tmpls?: { name: string; ord: number }[];
    [k: string]: unknown;
  }
>;

const DEFAULT_DECK = "Plume · Appris";

/**
 * Insert Basic-style notes/cards into an Anki collection database.
 * Returns the modified DB bytes and how many notes were added.
 */
export async function addCardsToCollection(
  dbBytes: Uint8Array,
  cards: LearnableCard[],
  deckName = DEFAULT_DECK
): Promise<{ bytes: Uint8Array; added: number; deckName: string; deckId: number }> {
  if (!cards.length) {
    return {
      bytes: dbBytes,
      added: 0,
      deckName,
      deckId: 1,
    };
  }

  const SQL = await getSql();
  const db: Database = new SQL.Database(dbBytes);

  try {
    const col = db.exec(
      "SELECT id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags FROM col LIMIT 1"
    );
    if (!col[0]?.values?.[0]) {
      throw new Error("Invalid Anki collection: missing col row");
    }

    const row = col[0].values[0];
    const modelsJson = String(row[9] ?? "{}");
    const decksJson = String(row[10] ?? "{}");
    const models = JSON.parse(modelsJson) as ModelMap;
    const decks = JSON.parse(decksJson) as DeckMap;

    // Prefer a Basic-like model with ≥2 fields
    let model = Object.values(models).find(
      (m) =>
        /basic/i.test(String(m.name || "")) &&
        Array.isArray(m.flds) &&
        (m.flds?.length || 0) >= 2
    );
    if (!model) {
      model = Object.values(models).find(
        (m) => Array.isArray(m.flds) && (m.flds?.length || 0) >= 2
      );
    }
    if (!model) {
      throw new Error("No suitable note type (need a model with ≥2 fields)");
    }

    const mid = Number(model.id);
    const fieldCount = model.flds?.length || 2;

    // Find or create deck
    let deckEntry = Object.values(decks).find(
      (d) => String(d.name).toLowerCase() === deckName.toLowerCase()
    );
    let deckId: number;
    if (!deckEntry) {
      deckId = Date.now();
      decks[String(deckId)] = {
        id: deckId,
        name: deckName,
        desc: "Cards learned in Plume writing practice",
        conf: 1,
        dyn: 0,
        collapsed: false,
        browserCollapsed: false,
        newToday: [0, 0],
        revToday: [0, 0],
        lrnToday: [0, 0],
        timeToday: [0, 0],
        extendNew: 10,
        extendRev: 50,
        usn: -1,
        mod: nowSec(),
      };
    } else {
      deckId = Number(deckEntry.id);
    }

    const t = nowSec();
    let added = 0;

    for (const card of cards) {
      const front = card.front.trim();
      const back = card.back.trim();
      if (!front || !back) continue;

      const fields = new Array(fieldCount).fill("");
      fields[0] = front;
      fields[1] = back;
      const flds = fields.join("\x1f");
      const sfld = front;
      const nid = Date.now() + added; // unique-ish note id
      const tags = ["plume", "appris", ...(card.tags || [])]
        .map((x) => x.replace(/\s+/g, "_"))
        .join(" ");

      db.run(
        `INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '')`,
        [
          nid,
          makeGuid(),
          mid,
          t,
          -1,
          ` ${tags} `,
          flds,
          sfld,
          fieldChecksum(sfld),
        ]
      );

      // One card per template ord 0 (Basic front→back)
      const cid = nid + 1;
      db.run(
        `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
         VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')`,
        [cid, nid, deckId, t, nid]
      );
      added += 1;
    }

    // Bump collection mod / schema markers so AnkiWeb accepts the upload
    const newDecks = JSON.stringify(decks);
    db.run(`UPDATE col SET decks = ?, mod = ?, scm = ?, usn = -1, ls = ?`, [
      newDecks,
      t,
      t,
      t,
    ]);

    const exported = db.export();
    return {
      bytes: exported,
      added,
      deckName,
      deckId,
    };
  } finally {
    db.close();
  }
}

/** Build cards from a rewrite result (French sentence + vocab issues). */
export function cardsFromRewrite(input: {
  corrected: string;
  intent?: string;
  issues?: { type: string; original: string; suggestion: string; explanation: string }[];
}): LearnableCard[] {
  const cards: LearnableCard[] = [];
  const seen = new Set<string>();

  const push = (front: string, back: string, tags: string[] = []) => {
    const key = front.toLowerCase();
    if (!front.trim() || !back.trim() || seen.has(key)) return;
    seen.add(key);
    cards.push({ front: front.trim(), back: back.trim(), tags });
  };

  if (input.corrected) {
    push(
      input.corrected,
      input.intent || "Phrase apprise dans Plume",
      ["phrase"]
    );
  }

  for (const issue of input.issues || []) {
    if (
      issue.type === "vocabulary" ||
      issue.type === "gender" ||
      issue.type === "spelling"
    ) {
      const front = issue.suggestion || issue.original;
      const back = [
        issue.explanation,
        issue.original && issue.suggestion && issue.original !== issue.suggestion
          ? `(${issue.original} → ${issue.suggestion})`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      push(front, back, [issue.type]);
    }
  }

  return cards;
}
