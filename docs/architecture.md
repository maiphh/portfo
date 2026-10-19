# Portfo v1 backend: architecture proposal (draft, not committed)

**Runtime.** Astro on Vercel via `@astrojs/vercel`. Pages stay prerendered (static by default); only `/api/*` routes opt into on-demand rendering (`export const prerender = false`), so the static-first performance story holds. DB: **Neon Postgres + pgvector**, schema/migrations with Drizzle, `@neondatabase/serverless` driver. LLM calls through the Vercel AI SDK so the provider is swappable.

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

1. **Ask about Phu (RAG).** Ingest script (runs in GitHub Actions on merge to main) chunks the CV + MDX case studies, re-embeds only rows whose `content_hash` changed, and upserts. `/api/chat` embeds the question, takes top-k chunks by cosine, streams a grounded answer with source links. The system prompt refuses off-topic questions and says "I don't know" instead of guessing.
2. **GitHub sync.** A scheduled GitHub Actions workflow (every 6h, free) calls `/api/cron/github-sync` with `CRON_SECRET`, which pulls repos and contributions via the GraphQL API using a read-only fine-grained token, upserts them, and logs to `sync_runs`. (Vercel Hobby cron only runs daily, so it's a fallback.)
3. **Contact form + worker.** `/api/contact` validates, checks Turnstile and the rate limit, inserts the message and a `classify_and_notify` job in one transaction, then kicks the worker right away with `waitUntil`. The worker claims jobs with `FOR UPDATE SKIP LOCKED`, classifies them with a small LLM (JSON output: category + confidence), and emails Phu via Resend (spam is stored but not emailed). It retries with backoff up to 5 attempts, and a sweeper cron re-runs stuck jobs.
4. **Analytics.** `navigator.sendBeacon` sends to `/api/view`, deduped per `visitor_hash`+slug+day. `/api/popular` returns the top case studies over 7 days, edge-cached for 30s. "Live" is done by polling that endpoint, so no websockets.

**Cloudflare alternative.** Workers + Queues + Cron Triggers would give a real queue and sub-daily cron. It isn't clearly better at this scale: the Postgres job table plus GitHub Actions cron covers it with one platform. Worth revisiting only if job volume grows.

## Providers and secrets

- **LLM:** OpenAI `gpt-4o-mini`-class, Google Gemini Flash (generous free tier), or Groq. Any of them can go through Vercel AI Gateway.
- **Embeddings:** OpenAI `text-embedding-3-small` (1536 dims) or Gemini embeddings. The dimension must match the column.
- **Secrets (Vercel env, never committed):** `DATABASE_URL`, `OPENAI_API_KEY` or `GEMINI_API_KEY`, `GITHUB_TOKEN` (read-only), `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` (+ public `PUBLIC_TURNSTILE_SITE_KEY`), `CRON_SECRET`, `VISITOR_HASH_SALT`, `NOTIFY_EMAIL`.

## Abuse protection

Cloudflare Turnstile on the form and on chat session start, plus a honeypot field. Postgres fixed-window rate limits: about 10 chat questions per visitor per hour and 3 form posts per visitor per day. Input capped at about 500 chars, output `max_tokens` capped, top-k limited. A global daily token budget switches chat to a "come back tomorrow" message when it's hit, and LLM classification flags injection-style content.

## Cost (free tiers; verify current limits)

Vercel Hobby (personal, non-commercial; fine for a portfolio), Neon free (0.5 GB is plenty for a few thousand chunks), GitHub Actions (free for public repos), Turnstile (free), and Resend free tier all cost $0. The only variable cost is LLM/embedding usage, expected to be a few dollars a month at most at portfolio traffic, and the daily budget cap keeps it bounded. Gemini's free tier could make it $0.

## Build order (after the design is approved and the static site ships)

1. DB foundation: Neon project, Drizzle schema, migrations, `jobs` and `rate_limits`.
2. Contact form + worker + Resend (smallest end-to-end slice, proves the queue).
3. Analytics beacon + most-viewed.
4. GitHub sync + display.
5. RAG chat (biggest cost and abuse surface, so it goes last and behind the budget cap).
