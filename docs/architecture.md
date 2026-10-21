# Portfo backend

What is deployed today: static Astro on Vercel, plus two Cloudflare Workers.

## Where each feature runs

| Feature               | Runtime                                                                 | Store                                                                                               |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Pages, case studies   | Astro on Vercel (`@astrojs/vercel`). Pages prerendered.                 | None                                                                                                |
| Chat agent            | Worker `portfo-chat` (`workers/chat`)                                   | Vectorize (`portfo-chat`, bge-m3, 1024 dims, cosine), Durable Object `Quota`, Rate Limiting binding |
| Contact form          | Worker `portfo-api` `POST /contact`                                     | D1: `contact_messages`. Email via Resend in the same request.                                       |
| Page views, most-read | Worker `POST /view`, `GET /popular`                                     | D1: `page_views`                                                                                    |
| GitHub activity       | Worker `GET /activity`; sync is Cron Trigger + `POST /cron/github-sync` | D1: `github_repos`, `github_activity`, `sync_runs`                                                  |

There is no Neon Postgres, no job queue, no LLM classification of contact messages, and no Postgres rate limits. The chat burst limit and Durable Object quota stay on `portfo-chat`.

## Data model (D1)

| Table              | Key columns                                                                             | Used by     |
| ------------------ | --------------------------------------------------------------------------------------- | ----------- |
| `contact_messages` | id, name, email, body, role, visitor_hash, created_at                                   | Contact     |
| `page_views`       | id, slug, visitor_hash, referrer_host, day, created_at; UNIQUE(visitor_hash, slug, day) | Analytics   |
| `github_repos`     | repo_id PK, name, url, description, language, stars, topics (JSON text), pushed_at      | GitHub sync |
| `github_activity`  | date, repo_id, commits, prs, issues                                                     | GitHub sync |
| `sync_runs`        | id, kind, started_at, finished_at, status, error                                        | GitHub sync |

Timestamps are ISO-8601 text. Days are `YYYY-MM-DD` in Asia/Ho_Chi_Minh.
`visitor_hash` = SHA-256(IP + UA + daily salt): no cookies, no raw IPs stored.

## Features

1. **Chat agent (Cloudflare Worker `portfo-chat`).** `POST /chat` runs an agent loop on Workers AI function calling. Read-only tools include bundled `workers/chat/data/site.json`, `get_github_stats` / `get_popular_projects` (call `API_URL` → portfo-api), and `search_knowledge` (Vectorize).
2. **GitHub sync.** Cron Trigger `17 */6 * * *` on portfo-api (same schedule as the old Actions workflow). Manual: `POST /cron/github-sync` with `Authorization: Bearer $CRON_SECRET`.
3. **Contact form.** `POST /contact` validates, drops honeypot fills, inserts the row, emails via Resend (visitor waits), then responds. If Resend fails, the row stays and the response is `email_failed` (502).
4. **Analytics.** `fetch(..., { keepalive: true })` to `/view`, one row per `visitor_hash` + slug + Asia/Ho_Chi_Minh day. `/popular` is the top case studies over 7 days (Cache-Control 30s).

## Providers and secrets

- **LLM / embeddings:** Cloudflare Workers AI on `portfo-chat` only. Contact does not call Workers AI.
- **Email:** Resend from `portfo-api` (`RESEND_API_KEY`, `NOTIFY_EMAIL`, optional `RESEND_FROM`).
- **API Worker secrets** (`workers/api/.dev.vars`): `VISITOR_HASH_SALT`, `RESEND_*`, `GITHUB_TOKEN`, `CRON_SECRET`, …
- **Chat Worker secrets** (`workers/chat/.dev.vars`): `INGEST_SECRET`, `SESSION_SIGNING_KEY`.
- **Site env** (`.env` / Vercel): `PUBLIC_USE_MOCKS`, `PUBLIC_API_URL`, `PUBLIC_CHAT_URL`, optional `SITE_URL`. No `DATABASE_URL`.

## Abuse protection

A honeypot on the contact form. The chat Worker allows 3 messages per 10 s (Rate Limiting) and 10 per 10 minutes per visitor (Durable Object), a 500-character input cap, and a global daily message budget (Durable Object, default 50). Contact and view beacons have no rate-limit tables.

## Setup

1. **Site, sample data only.** Copy `.env.example` to `.env`, leave `PUBLIC_USE_MOCKS=true`. `pnpm install && pnpm dev`.
2. **API Worker.** In `workers/api`: `pnpm install && pnpm test`. Then `wrangler login`, `wrangler d1 create portfo`, put the `database_id` into `wrangler.jsonc` (top level and `env.production`), copy `.dev.vars.example` to `.dev.vars`, `pnpm dev`. Apply migrations with `wrangler d1 migrations apply portfo --local` (and `--remote` for production).
3. **Chat Worker.** See `workers/chat/README.md`. Set `API_URL` to the portfo-api origin so GitHub/popular tools work.
4. **Site live.** `PUBLIC_USE_MOCKS=false`, `PUBLIC_API_URL`, `PUBLIC_CHAT_URL`.
