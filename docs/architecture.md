# Portfo v1 backend: architecture proposal (updated for the Cloudflare chat)

**Runtime.** Astro on Vercel via `@astrojs/vercel`. Pages stay prerendered (static by default); only `/api/*` routes opt into on-demand rendering (`export const prerender = false`), so the static-first performance story holds. DB: **Neon Postgres + pgvector**, schema/migrations with Drizzle, `@neondatabase/serverless` driver. Every model call goes to **Cloudflare Workers AI**: the chat is a separate Worker (`workers/chat`, see below), and contact classification uses the Workers AI REST API. (Updated Oct 2026: the chat moved from a Vercel `/api/chat` + Gemini plan to Cloudflare.)

## Data model

| Table              | Key columns                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `documents`        | id, source (`cv`/`case_study`), slug, title, content_hash, updated_at                                                                                        |
| `chunks`           | id, document_id, idx, content, embedding `vector(1536)` (HNSW, cosine)                                                                                       |
| `chat_logs`        | id, visitor_hash, question, answer, source_chunk_ids, tokens_in/out, created_at                                                                              |
| `github_repos`     | repo_id PK, name, url, description, language, stars, topics, pushed_at                                                                                       |
| `github_activity`  | date, repo_id, commits, prs, issues (daily rollup)                                                                                                           |
| `contact_messages` | id, name, email, body, visitor_hash, category (`recruiter`/`client`/`other`/`spam`), confidence, status (`new`/`classified`/`notified`/`failed`), created_at |
| `jobs`             | id, type, payload jsonb, status, attempts, run_after, last_error (Postgres-backed queue)                                                                     |
| `page_views`       | id, slug, visitor_hash, referrer_host, created_at                                                                                                            |
| `rate_limits`      | key, window_start, count                                                                                                                                     |
| `sync_runs`        | id, kind, started_at, finished_at, status, error                                                                                                             |

`visitor_hash` = SHA-256(IP + UA + daily-rotating salt): no cookies, no raw IPs stored.

## Features

1. **Chat agent (Cloudflare Worker `portfo-chat`).** `POST /chat` runs an agent loop on Workers AI function calling (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, 8B fallback), at most 3 tool rounds, then a forced answer, streamed as SSE with `status` events per tool call and a final `sources` event. Read-only tools: `list_projects`, `get_project`, `get_experience`, `get_contact` (bundled JSON generated from the content collection), `get_github_stats` and `get_popular_projects` (this site's `/api/activity` and `/api/popular`), and `search_knowledge` (bge-m3, 1024 dims, Vectorize). `POST /ingest` (Bearer `INGEST_SECRET`, run from GitHub Actions on merge to main) chunks, embeds and upserts the CV and case studies. Sources are only links the tools returned; with no tool data the answer is a fixed "I don't know". The `documents`/`chunks`/`chat_logs` tables are unused and can be dropped in a later migration.
2. **GitHub sync.** A scheduled GitHub Actions workflow (every 6h, free) calls `/api/cron/github-sync` with `CRON_SECRET`, which pulls repos and contributions via the GraphQL API using a read-only fine-grained token, upserts them, and logs to `sync_runs`. (Vercel Hobby cron only runs daily, so it's a fallback.)
3. **Contact form + worker.** `/api/contact` validates, checks Turnstile and the rate limit, inserts the message and a `classify_and_notify` job in one transaction, then kicks the worker right away with `waitUntil`. The worker claims jobs with `FOR UPDATE SKIP LOCKED`, classifies them with a small LLM (JSON output: category + confidence), and emails Phu via Resend (spam is stored but not emailed). It retries with backoff up to 5 attempts, and a sweeper cron re-runs stuck jobs.
4. **Analytics.** `navigator.sendBeacon` sends to `/api/view`, deduped per `visitor_hash`+slug+day. `/api/popular` returns the top case studies over 7 days, edge-cached for 30s. "Live" is done by polling that endpoint, so no websockets.

**Cloudflare alternative.** Workers + Queues + Cron Triggers would give a real queue and sub-daily cron. It isn't clearly better at this scale: the Postgres job table plus GitHub Actions cron covers it with one platform. Worth revisiting only if job volume grows.

## Providers and secrets

- **LLM:** Cloudflare Workers AI. Chat: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (fallback `@cf/meta/llama-3.1-8b-instruct`). Contact classification: `@cf/meta/llama-3.1-8b-instruct` in JSON mode.
- **Embeddings:** `@cf/baai/bge-m3` (1024 dims, multilingual) in a Vectorize index `portfo-chat` (cosine).
- **Worker secrets (Wrangler, never committed):** `TURNSTILE_SECRET_KEY`, `INGEST_SECRET`, `SESSION_SIGNING_KEY`. See `workers/chat/README.md`.
- **Secrets (Vercel env, never committed):** `DATABASE_URL`, `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_API_TOKEN` (Workers AI: Read), `GITHUB_TOKEN` (read-only), `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` (+ public `PUBLIC_TURNSTILE_SITE_KEY`), `CRON_SECRET`, `VISITOR_HASH_SALT`, `NOTIFY_EMAIL`.

## Abuse protection

Cloudflare Turnstile on the form and on chat session start, plus a honeypot field. Postgres fixed-window rate limits: 3 form posts per visitor per day. The chat Worker allows 3 messages per 10 s (Rate Limiting binding) and 10 per 10 minutes per visitor (Durable Object). Input capped at about 500 chars, output `max_tokens` capped, top-k limited. A global daily message budget (Durable Object) switches chat to a "come back tomorrow" message when it's hit, and LLM classification flags injection-style content.

## Cost (free tiers; verify current limits)

Vercel Hobby (personal, non-commercial; fine for a portfolio), Neon free (0.5 GB is plenty for a few thousand chunks), GitHub Actions (free for public repos), Turnstile (free), and Resend free tier all cost $0. The only variable cost is Workers AI usage beyond the free daily allowance (10k neurons). An agent turn on the 70B model is several calls, so the daily message cap (default 50) keeps it bounded; Workers Paid ($5/month) is only needed beyond the free limits.

## Build order (after the design is approved and the static site ships)

1. DB foundation: Neon project, Drizzle schema, migrations, `jobs` and `rate_limits`.
2. Contact form + worker + Resend (smallest end-to-end slice, proves the queue).
3. Analytics beacon + most-viewed.
4. GitHub sync + display.
5. RAG chat (biggest cost and abuse surface, so it goes last and behind the budget cap).
