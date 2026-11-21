# Plume

French writing practice powered by AI intent rewrite, plus AnkiWeb deck sync.

## Run locally

```bash
cd plume
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Environment

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables full model rewrites for messy mixed French/English (recommended) |
| `OPENAI_BASE_URL` | Optional OpenAI-compatible base URL (default `https://api.openai.com/v1`) |
| `OPENAI_MODEL` | Optional model id (default `gpt-4o-mini`) |
| `PLUME_SESSION_SECRET` | AES key material for encrypting the AnkiWeb session cookie (set a strong secret in production) |
| `LANGUAGETOOL_API_URL` | Optional; reserved for grammar polish helpers |

Without `OPENAI_API_KEY`, Plume uses a **local AI path**: Franglais phrase templates + lexicon rewrite that still handles examples like `je want to le store` → `Je veux aller au magasin.` The UI labels which engine ran.

## Features

### Writing practice (primary)

- Accepts messy mixed French/English, not only already-French text.
- Infers intent, returns a proper French sentence, and short explanations (vocabulary, gender, grammar).
- Model API when `OPENAI_API_KEY` is set; otherwise local Franglais heuristics.

### AnkiWeb sync (secondary)

Uses the **Anki sync protocol** (not AnkiConnect):

1. `POST …/sync/hostKey` → host key (`hkey`)
2. `POST …/sync/download` → full `collection.anki2`
3. Parse decks/notes with sql.js

**What works**

- Connect / disconnect / refresh
- Encrypted httpOnly cookie stores `hkey` + endpoint + username (password not kept after login)
- Passwords are never logged
- Deck list + note preview after a successful download
- Labeled **demo data** when not connected or live sync fails

**Limits & caveats**

- AnkiWeb has no public REST API; protocol v11 against `sync.ankiweb.net` may change.
- Full download can be large; notes capped at 500 in the UI.
- Media is not synced.
- HTTP 308 regional redirects are followed automatically.

## Stack

Next.js (App Router) · TypeScript · Tailwind · OpenAI-compatible chat API · AnkiWeb sync · sql.js
