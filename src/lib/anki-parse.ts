import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import path from "path";
import fs from "fs";
import type { AnkiCollectionData, AnkiDeckSummary, AnkiNoteSummary } from "./ankiweb";

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
      // Types from @types/sql.js require this flag; runtime accepts the config.
      useOldExtensionFunctions: false,
    } as Parameters<typeof initSqlJs>[0]);
  }
  return sqlPromise;
}

type DeckMap = Record<
  string,
  { id: number | string; name: string; [k: string]: unknown }
>;

function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function parseAnkiCollection(
  dbBytes: Uint8Array
): Promise<AnkiCollectionData> {
  const SQL = await getSql();
  const db: Database = new SQL.Database(dbBytes);

  try {
    const colRow = db.exec("SELECT decks FROM col LIMIT 1");
    const decksJson =
      colRow[0]?.values?.[0]?.[0] != null
        ? String(colRow[0].values[0][0])
        : "{}";
    const deckMap = JSON.parse(decksJson) as DeckMap;

    const cardCounts = new Map<number, number>();
    const cardDeck = new Map<number, number>(); // note id -> did (first card)

    const cards = db.exec("SELECT nid, did FROM cards");
    if (cards[0]) {
      for (const row of cards[0].values) {
        const nid = Number(row[0]);
        const did = Number(row[1]);
        cardCounts.set(did, (cardCounts.get(did) || 0) + 1);
        if (!cardDeck.has(nid)) cardDeck.set(nid, did);
      }
    }

    const decks: AnkiDeckSummary[] = Object.values(deckMap)
      .filter((d) => d && d.name && !String(d.name).startsWith("std::"))
      .map((d) => {
        const idNum = Number(d.id);
        return {
          id: String(d.id),
          name: String(d.name),
          cardCount: cardCounts.get(idNum) || 0,
        };
      })
      .filter((d) => d.name !== "Default" || d.cardCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    const idToName = new Map<number, string>();
    for (const d of Object.values(deckMap)) {
      idToName.set(Number(d.id), String(d.name));
    }

    const notes: AnkiNoteSummary[] = [];
    const noteRows = db.exec("SELECT id, flds, tags FROM notes LIMIT 500");
    if (noteRows[0]) {
      for (const row of noteRows[0].values) {
        const id = Number(row[0]);
        const flds = String(row[1] ?? "")
          .split("\x1f")
          .map(stripHtml)
          .filter(Boolean);
        const tags = String(row[2] ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const did = cardDeck.get(id);
        notes.push({
          id,
          deckName: did != null ? idToName.get(did) || "Unknown" : "Unknown",
          fields: flds,
          tags,
        });
      }
    }

    return {
      decks,
      notes,
      syncedAt: new Date().toISOString(),
    };
  } finally {
    db.close();
  }
}
