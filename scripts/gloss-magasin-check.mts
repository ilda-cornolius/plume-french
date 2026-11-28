/**
 * Guard: magasin must gloss as shop/store, never magazine.
 * Run: npx tsx scripts/gloss-magasin-check.mts
 */
import { localGloss, localIpa, infoManyLocal } from "../src/lib/fr-gloss.ts";

const g = localGloss("magasin");
const info = infoManyLocal(["magasin"]);
const ok =
  g != null &&
  /shop|store/i.test(g) &&
  !/magazine/i.test(g) &&
  info.magasin?.en === g &&
  Boolean(localIpa("magasin"));

if (!ok) {
  console.error("FAIL magasin gloss", { g, info });
  process.exit(1);
}
console.log("PASS magasin →", g, localIpa("magasin"));
