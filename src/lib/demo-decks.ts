import type { AnkiCollectionData } from "./ankiweb";

/** Sample French decks shown only when live AnkiWeb sync fails or user browses offline. */
export const DEMO_COLLECTION: AnkiCollectionData = {
  syncedAt: new Date().toISOString(),
  decks: [
    { id: "demo-1", name: "Français · Essentials", cardCount: 8 },
    { id: "demo-2", name: "Français · Verbes du jour", cardCount: 6 },
    { id: "demo-3", name: "Français · Genre des noms", cardCount: 5 },
  ],
  notes: [
    {
      id: 1,
      deckName: "Français · Essentials",
      fields: ["bonjour", "hello / good morning"],
      tags: ["greeting"],
    },
    {
      id: 2,
      deckName: "Français · Essentials",
      fields: ["s'il vous plaît", "please (formal)"],
      tags: ["politeness"],
    },
    {
      id: 3,
      deckName: "Français · Essentials",
      fields: ["merci beaucoup", "thank you very much"],
      tags: ["politeness"],
    },
    {
      id: 4,
      deckName: "Français · Essentials",
      fields: ["Comment ça va ?", "How are you?"],
      tags: ["greeting"],
    },
    {
      id: 5,
      deckName: "Français · Verbes du jour",
      fields: ["je mange", "I eat / I am eating"],
      tags: ["manger", "présent"],
    },
    {
      id: 6,
      deckName: "Français · Verbes du jour",
      fields: ["nous sommes allés", "we went (masc. or mixed)"],
      tags: ["aller", "passé composé"],
    },
    {
      id: 7,
      deckName: "Français · Verbes du jour",
      fields: ["elle a fini", "she finished"],
      tags: ["finir", "passé composé"],
    },
    {
      id: 8,
      deckName: "Français · Genre des noms",
      fields: ["une pomme", "an apple (feminine)"],
      tags: ["genre"],
    },
    {
      id: 9,
      deckName: "Français · Genre des noms",
      fields: ["un livre", "a book (masculine)"],
      tags: ["genre"],
    },
    {
      id: 10,
      deckName: "Français · Genre des noms",
      fields: ["l'eau (f.)", "water — feminine despite l'"],
      tags: ["genre", "élision"],
    },
  ],
};
