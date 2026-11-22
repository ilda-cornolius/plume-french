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

/** Schema 18 stores deck path segments joined by \x1f; Anki UI uses :: */
function normalizeDeckName(name: string): string {
  return name.replace(/\x1f/g, "::");
}

function tableExists(db: Database, name: string): boolean {
  const rows = db.exec(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name='${name.replace(/'/g, "''")}' LIMIT 1`
  );
  return Boolean(rows[0]?.values?.length);
}

function loadDecksFromColJson(db: Database): Map<number, string> {
  const idToName = new Map<number, string>();
  const colRow = db.exec("SELECT decks FROM col LIMIT 1");
  const decksJson =
    colRow[0]?.values?.[0]?.[0] != null
      ? String(colRow[0].values[0][0])
      : "";
  if (!decksJson.trim()) return idToName;
  let deckMap: DeckMap;
  try {
    deckMap = JSON.parse(decksJson) as DeckMap;
  } catch {
    return idToName;
  }
  for (const d of Object.values(deckMap)) {
    if (!d || d.name == null) continue;
    idToName.set(Number(d.id), normalizeDeckName(String(d.name)));
  }
  return idToName;
}

function loadDecksFromTable(db: Database): Map<number, string> {
  const idToName = new Map<number, string>();
  if (!tableExists(db, "decks")) return idToName;
  const rows = db.exec("SELECT id, name FROM decks");
  if (!rows[0]) return idToName;
  for (const row of rows[0].values) {
    idToName.set(Number(row[0]), normalizeDeckName(String(row[1] ?? "")));
  }
  return idToName;
}

export async function parseAnkiCollection(
  dbBytes: Uint8Array
): Promise<AnkiCollectionData> {
  const SQL = await getSql();
  const db: Database = new SQL.Database(dbBytes);

  try {
    // Schema 11: deck JSON in col.decks. Schema 18+: rows in decks table
    // (col.decks is often empty — JSON.parse("") caused "Unexpected end of JSON input").
    let idToName = loadDecksFromColJson(db);
    if (idToName.size === 0) {
      idToName = loadDecksFromTable(db);
    }

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

    const decks: AnkiDeckSummary[] = [...idToName.entries()]
      .filter(([, name]) => name && !name.startsWith("std::"))
      .map(([id, name]) => ({
        id: String(id),
        name,
        cardCount: cardCounts.get(id) || 0,
      }))
      .filter((d) => d.name !== "Default" || d.cardCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

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
