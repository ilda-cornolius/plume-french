/**
 * Reproduce / verify Anki schema-18 "unicase" collation vs sql.js.
 * Run: npx tsx scripts/anki-unicase-repro.mts
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { addCardsToCollection } from "../src/lib/anki-mutate.ts";

const FIXTURE = "/tmp/anki-unicase.db";

function buildFixture() {
  const py = `
import sqlite3
from pathlib import Path
path = Path(${JSON.stringify(FIXTURE)})
if path.exists(): path.unlink()
con = sqlite3.connect(path)
con.create_collation("unicase", lambda a,b: (a.lower()>b.lower())-(a.lower()<b.lower()))
t=1700000000
mid=1700000000001
con.executescript(f"""
CREATE TABLE col (
  id integer primary key, crt integer, mod integer, scm integer, ver integer,
  dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text
);
CREATE TABLE notes (
  id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null,
  tags text not null, flds text not null, sfld text not null, csum integer not null, flags integer not null, data text not null
);
CREATE TABLE cards (
  id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null,
  type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null,
  lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null
);
CREATE TABLE decks (
  id integer primary key, name text not null COLLATE unicase, mtime_secs integer not null, usn integer not null, common blob not null, kind blob not null
);
CREATE UNIQUE INDEX idx_decks_name ON decks (name);
CREATE TABLE notetypes (
  id integer primary key, name text not null COLLATE unicase, mtime_secs integer not null, usn integer not null, config blob not null
);
CREATE TABLE fields (
  ntid integer not null, ord integer not null, name text not null, config blob not null,
  PRIMARY KEY (ntid, ord)
);
INSERT INTO col VALUES (1,{t},{t},{t},18,0,0,{t},{t},'{{}}','{{}}','{{}}','{{}}');
INSERT INTO notetypes VALUES ({mid}, 'Basic', {t}, -1, X'00');
INSERT INTO fields VALUES ({mid}, 0, 'Front', X'00');
INSERT INTO fields VALUES ({mid}, 1, 'Back', X'00');
INSERT INTO decks VALUES (1, 'Default', {t}, -1, X'08011001', X'0a020801');
""")
con.commit(); con.close()
print("ok", path)
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "fixture failed");
  }
}

async function main() {
  buildFixture();
  const bytes = new Uint8Array(fs.readFileSync(FIXTURE));
  const phrase = "Tous mes amis sont vivants.";
  const result = await addCardsToCollection(
    bytes,
    [{ front: phrase, back: "All my friends are alive. / Phrase apprise dans Plume" }],
    "Plume · Appris"
  );
  console.log("PASS added=", result.added, "deckId=", result.deckId, "deck=", result.deckName);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
