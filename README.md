# Plume

French writing practice with Gemini AI rewrite, conversation chat, levels, and AnkiWeb sync.

## Run locally

```bash
cd plume
cp .env.example .env.local   # then add GEMINI_API_KEY
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Free Gemini API key (recommended)

1. Open [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with a Google account
3. Click **Create API key**
4. Put the key in `.env.local` as `GEMINI_API_KEY=…` (never commit `.env.local`)
5. Restart `npm run dev`

Optional: `GEMINI_MODEL` (default `gemini-flash-lite-latest`).

Fallbacks: `GROQ_API_KEY`, `OPENAI_API_KEY`. Without any key, Plume uses a local Franglais path for rewrite and scripted chat lines.

Also: `PLUME_SESSION_SECRET` for encrypting the AnkiWeb session cookie in production.

## Features

- **Écrire** — mixed French/English → proper French + explanations; XP / levels / streaks
- **Parler** — conversation practice chat with Gemini
- **Anki** — connect AnkiWeb, browse decks; **Save to AnkiWeb** from a correction uploads notes to deck `Plume · Appris`

### AnkiWeb notes

Uses the Anki sync protocol (`hostKey` → download → mutate → upload), not AnkiConnect. Passwords are never logged; only an encrypted httpOnly host-key cookie is kept. Demo decks appear when disconnected. Protocol may change; media is not synced; uploads replace the server collection after a local merge — sync from Anki desktop first if you have unsynced local changes.

## Stack

Next.js · TypeScript · Tailwind · Gemini / Groq / OpenAI · AnkiWeb sync · sql.js
