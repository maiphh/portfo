# portfo-api

Cloudflare Worker for the portfolio's data APIs: contact form, page views, and GitHub activity. Uses D1, Resend, and a Cron Trigger. The Astro site on Vercel calls this Worker via `PUBLIC_API_URL`.

## Routes

| Method    | Path                | Notes                                                           |
| --------- | ------------------- | --------------------------------------------------------------- |
| `POST`    | `/contact`          | Honeypot → validate → store → Resend (same request) |
| `POST`    | `/view`             | Page-view beacon; one row per visitor + slug + local day        |
| `GET`     | `/popular?days=`    | Most-read case studies (1–30, default 7)                        |
| `GET`     | `/activity`         | GitHub summary for the home page                                |
| `POST`    | `/cron/github-sync` | Bearer `CRON_SECRET`; Cron Trigger also runs every 6 hours      |
| `GET`     | `/health`           | Liveness; booleans for which secrets are set                    |
| `OPTIONS` | `*`                 | CORS preflight                                                  |

CORS allows only `ALLOWED_ORIGINS`. Requests with no `Origin` are allowed (cron, curl).

## Local

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm work          # refresh data/work.json from src/content/work
pnpm check:config  # fails if wrangler.jsonc still has REPLACE_ME

wrangler login
wrangler d1 create portfo   # put database_id into wrangler.jsonc (top level + env.production)
cp .dev.vars.example .dev.vars
wrangler d1 migrations apply portfo --local
pnpm dev
```

Secrets are documented in `.dev.vars.example`. Vars (`ALLOWED_ORIGINS`, `ENVIRONMENT`) live in `wrangler.jsonc`. The committed `database_id` is a local placeholder until you create the real D1 database.
