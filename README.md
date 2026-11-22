# Plume

French writing + chat practice with Gemini AI, Google sign-in, levels, AnkiWeb sync, and installable PWA.

## Run locally

```bash
cd plume
cp .env.example .env.local
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Environment

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio key (recommended free tier) — [get a key](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | Default `gemini-flash-lite-latest` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (Web client). Redirect: `{AUTH_URL}/api/auth/callback/google` |
| `AUTH_SECRET` | Random secret for Auth.js sessions (required in production) |
| `AUTH_URL` | Public site origin, e.g. `https://your-host` or `http://127.0.0.1:3000` |
| `PLUME_SESSION_SECRET` | Encrypts AnkiWeb session cookie |
| `GROQ_API_KEY` / `OPENAI_API_KEY` | Optional LLM fallbacks |

Never commit `.env.local`.

### Google OAuth setup

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create **OAuth client ID** → Web application
3. Authorized redirect URI: `http://127.0.0.1:3000/api/auth/callback/google` (and your hosted URL when live)
4. Copy client ID/secret into `.env.local` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
5. Set `AUTH_SECRET` (e.g. `openssl rand -base64 32`) and `AUTH_URL`

Until these are set, the nav shows “Google login off”; the rest of the app still works.

## Features

- **Écrire** — Franglais → French (Gemini); XP / levels / streaks; **Save to AnkiWeb**
- **Parler** — conversation chat (Gemini)
- **Anki** — AnkiWeb connect / refresh / upload to `Plume · Appris`
- **PWA** — installable on Android Chrome (Add to Home Screen) via `manifest.webmanifest` + service worker
- **Google login** — Auth.js (NextAuth v5)

## AnkiWeb sync

Uses the Anki sync protocol (not AnkiConnect):

1. `hostKey` → host key
2. Follow **301/302/303/307/308** redirects + `meta` `hostNum` / `new_endpoint` for regional hosts
3. `download` collection → parse decks/notes (sql.js)
4. Optional mutate + `upload` for learned cards

Passwords are never logged; only an encrypted httpOnly host-key cookie is kept. Demo decks show when disconnected or if live sync still fails.

**Caveats:** AnkiWeb has no public REST API; protocol may change. Media is not synced. Full upload replaces the server collection after a local merge — sync Anki desktop first if you have unsynced local edits.

## Android install (PWA)

On Android Chrome (HTTPS or localhost):

1. Open Plume
2. Menu → **Add to Home screen** / **Install app**
3. Launch from the home-screen icon (standalone)

## Hosted publish

This app is deploy-ready (`npm run build`). Cursor `publish-app` must run from a **repository-linked** cloud agent on `ilda-cornolius/plume-french`. Bind secrets there: `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `AUTH_URL`, `PLUME_SESSION_SECRET`.

## Stack

Next.js 16 · Auth.js · Gemini · AnkiWeb sync · sql.js · PWA
