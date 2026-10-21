# portfo

Cloudflare Worker for the portfolio: contact form, page views, GitHub activity, and the chat
agent. Uses D1, Resend, a Cron Trigger, Workers AI, a Durable Object quota, and a Rate Limiting
binding. The Astro site on Vercel calls this Worker via `PUBLIC_WORKER_URL`.

The live URL is whatever `wrangler deploy` prints for Worker name `portfo`. The retired
`portfo-chat` Worker can be deleted in the Cloudflare dashboard after the site points at
`PUBLIC_WORKER_URL`.

## Routes

| Method    | Path                | Notes                                                                     |
| --------- | ------------------- | ------------------------------------------------------------------------- |
| `POST`    | `/chat`             | Agent loop with read-only tools, streamed as SSE. Only `ALLOWED_ORIGINS`. |
| `POST`    | `/contact`          | Honeypot → validate → store → Resend (same request)                       |
| `POST`    | `/view`             | Page-view beacon; one row per visitor + slug + local day                  |
| `GET`     | `/popular?days=`    | Most-read case studies (1–30, default 7)                                  |
| `GET`     | `/activity`         | GitHub summary for the home page                                          |
| `POST`    | `/cron/github-sync` | Bearer `CRON_SECRET`; Cron Trigger also runs every 6 hours                |
| `GET`     | `/health`           | Liveness; models, limits, tools, booleans for which secrets are set       |
| `OPTIONS` | `*`                 | CORS preflight                                                            |

CORS allows only `ALLOWED_ORIGINS`. Requests with no `Origin` are allowed for data routes and
cron/curl; `/chat` still requires an allowed browser Origin.

## Chat agent

- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with Workers AI function calling;
  `@cf/meta/llama-3.1-8b-instruct` if a call fails.
- Tools (all read-only): `list_projects`, `get_project`, `get_experience`, `get_contact` read
  bundled `data/site.json`; `get_github_stats` and `get_popular_projects` call in-process
  `getActivity` / `getPopular` on D1 (no HTTP hop).
- Sources are only the links tools returned. No useful tool data → fixed "I don't know" answer.
- No Vectorize, no embeddings, no `/ingest`.

## Local

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm corpus        # refresh data/site.json from site content
pnpm work          # refresh data/work.json from case studies
pnpm check:config  # fails if wrangler.jsonc still has REPLACE_ME

wrangler login
wrangler d1 create portfo   # put database_id into wrangler.jsonc (top level + env.production)
cp .dev.vars.example .dev.vars
wrangler d1 migrations apply portfo --local
pnpm dev
```

Secrets are documented in `.dev.vars.example`. Vars (`ALLOWED_ORIGINS`, `ENVIRONMENT`, chat
model knobs) live in `wrangler.jsonc`. The committed `database_id` is the `portfo` D1 database (an id,
not a secret); on a fresh account replace it after `wrangler d1 create portfo`. Top-level config stays deployable for local dev (no
`REPLACE_ME`); `env.production` fails the deploy guard until its placeholders are filled and
`ALLOWED_ORIGINS` includes an `https://` origin with `ENVIRONMENT=production`.
