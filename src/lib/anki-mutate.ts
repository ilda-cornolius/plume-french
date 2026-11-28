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

/** Empty-ish protobuf blobs copied from Anki schema-18 Default deck. */
const SCHEMA18_DECK_COMMON = new Uint8Array(Buffer.from("08011001", "hex"));
const SCHEMA18_DECK_KIND = new Uint8Array(Buffer.from("0a020801", "hex"));

/** Anki registers these in Rust; sql.js cannot — queries/indexes that need them fail. */
const ANKI_CUSTOM_COLLATIONS = ["unicase", "unicode"];

function tableExists(db: Database, name: string): boolean {
  const rows = db.exec(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name='${name.replace(/'/g, "''")}' LIMIT 1`
  );
  return Boolean(rows[0]?.values?.length);
}

/**
 * Drop indexes that depend on Anki's custom collations (e.g. unicase).
 * sql.js has no create_collation, so equality / unique checks on
 * COLLATE unicase columns throw "no such collation sequence" or
 * "no query solution". Index SQL often omits the collation name even
 * when the column is unicase — drop all indexes on those tables.
 * Safe on the in-memory copy we mutate before upload; Anki rebuilds indexes.
 */
function dropCustomCollationIndexes(db: Database): void {
  const tables = db.exec(`SELECT name, sql FROM sqlite_master WHERE type = 'table'`);
  if (!tables[0]?.values?.length) return;

  const tainted = new Set<string>();
  for (const row of tables[0].values) {
    const name = String(row[0] || "");
    const sql = String(row[1] || "").toLowerCase();
    if (!name || name.startsWith("sqlite_")) continue;
    if (ANKI_CUSTOM_COLLATIONS.some((c) => sql.includes(`collate ${c}`))) {
      tainted.add(name);
    }
  }
  if (!tainted.size) return;

  const indexes = db.exec(
    `SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index'`
  );
  if (!indexes[0]?.values?.length) return;
  for (const row of indexes[0].values) {
    const name = String(row[0] || "");
    const tbl = String(row[1] || "");
    const sql = String(row[2] || "").toLowerCase();
    if (!name || name.startsWith("sqlite_")) continue;
    const byTable = tainted.has(tbl);
    const bySql = ANKI_CUSTOM_COLLATIONS.some((c) => sql.includes(c));
    if (!byTable && !bySql) continue;
    db.run(`DROP INDEX IF EXISTS "${name.replace(/"/g, '""')}"`);
  }
}

function collectionVersion(db: Database): number {
  const rows = db.exec("SELECT ver FROM col LIMIT 1");
  return Number(rows[0]?.values?.[0]?.[0] ?? 11);
}

function resolveModelSchema11(db: Database): { mid: number; fieldCount: number } {
  const col = db.exec("SELECT models FROM col LIMIT 1");
  const modelsJson = String(col[0]?.values?.[0]?.[0] ?? "{}");
  const models = (modelsJson.trim() ? JSON.parse(modelsJson) : {}) as ModelMap;
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
  return { mid: Number(model.id), fieldCount: model.flds?.length || 2 };
}

function resolveModelSchema18(db: Database): { mid: number; fieldCount: number } {
  if (!tableExists(db, "notetypes")) {
    throw new Error("Schema 18 collection missing notetypes table");
  }
  const nts = db.exec("SELECT id, name FROM notetypes");
  if (!nts[0]?.values?.length) {
    throw new Error("No note types in collection");
  }
  let mid: number | null = null;
  for (const row of nts[0].values) {
    const name = String(row[1] || "");
    if (/basic/i.test(name) && !/reverse|optional|type/i.test(name)) {
      mid = Number(row[0]);
      break;
    }
  }
  if (mid == null) {
    // any notetype with ≥2 fields
    for (const row of nts[0].values) {
      const id = Number(row[0]);
      const flds = db.exec(`SELECT count(*) FROM fields WHERE ntid = ${id}`);
      const n = Number(flds[0]?.values?.[0]?.[0] ?? 0);
      if (n >= 2) {
        mid = id;
        break;
      }
    }
  }
  if (mid == null) {
    throw new Error("No suitable note type (need a model with ≥2 fields)");
  }
  const flds = db.exec(`SELECT count(*) FROM fields WHERE ntid = ${mid}`);
  const fieldCount = Math.max(2, Number(flds[0]?.values?.[0]?.[0] ?? 2));
  return { mid, fieldCount };
}

function resolveOrCreateDeckSchema11(
  db: Database,
  deckName: string
): number {
  const col = db.exec("SELECT decks FROM col LIMIT 1");
  const decksJson = String(col[0]?.values?.[0]?.[0] ?? "{}");
  const decks = (decksJson.trim() ? JSON.parse(decksJson) : {}) as DeckMap;
  const deckEntry = Object.values(decks).find(
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
  db.run(`UPDATE col SET decks = ?, mod = ?, usn = -1`, [
    JSON.stringify(decks),
    t,
  ]);
  return deckId;
}

function resolveOrCreateDeckSchema18(db: Database, deckName: string): number {
  // Do not use WHERE name = … — decks.name is COLLATE unicase and sql.js
  // cannot resolve that collation (throws "no query solution").
  const all = db.exec(`SELECT id, name FROM decks`);
  const target = deckName.toLowerCase();
  const match = all[0]?.values?.find(
    (row) => String(row[1] || "").toLowerCase() === target
  );
  if (match?.[0] != null) {
    return Number(match[0]);
  }

  dropCustomCollationIndexes(db);

  const deckId = Date.now();
  const t = nowSec();
  db.run(
    `INSERT INTO decks (id, name, mtime_secs, usn, common, kind) VALUES (?, ?, ?, -1, ?, ?)`,
    [
      deckId,
      deckName,
      t,
      SCHEMA18_DECK_COMMON,
      SCHEMA18_DECK_KIND,
    ]
  );
  // Recreate a portable unique index Anki can live with until it rebuilds.
  try {
    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_name ON decks (name COLLATE NOCASE)`
    );
  } catch {
    // ignore if name collision or schema forbids — notes still saved
  }
  return deckId;
}

/**
 * Insert Basic-style notes/cards into an Anki collection database.
 * Supports schema 11 (JSON in col) and schema 18+ (decks/notetypes tables).
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
    const col = db.exec("SELECT id FROM col LIMIT 1");
    if (!col[0]?.values?.[0]) {
      throw new Error("Invalid Anki collection: missing col row");
    }

    const ver = collectionVersion(db);
    const schema18 = ver >= 18 || tableExists(db, "decks");

    // Drop unicase indexes early so later inserts/lookups cannot trip them.
    if (schema18) dropCustomCollationIndexes(db);

    const { mid, fieldCount } = schema18
      ? resolveModelSchema18(db)
      : resolveModelSchema11(db);

    const deckId = schema18
      ? resolveOrCreateDeckSchema18(db, deckName)
      : resolveOrCreateDeckSchema11(db, deckName);

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
      const nid = Date.now() + added;
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

      const cid = nid + 1;
      db.run(
        `INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
         VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')`,
        [cid, nid, deckId, t, nid]
      );
      added += 1;
    }

    db.run(`UPDATE col SET mod = ?, scm = ?, usn = -1, ls = ?`, [t, t, t]);

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
