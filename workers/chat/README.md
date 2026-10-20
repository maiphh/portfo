# portfo-chat

The chat agent for Mai Gia Phu's portfolio, as its own Cloudflare Worker. The Astro site
stays on Vercel; the chat window (next PR) and the ink-dot mascot (the one after) call
this Worker. **Not deployed yet.**

## Endpoints

| Route          | What it does                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `POST /chat`   | Agent loop with read-only tools, streamed as server-sent events. Only `ALLOWED_ORIGINS` (CORS). |
| `POST /ingest` | `Authorization: Bearer $INGEST_SECRET`. Chunks, embeds (bge-m3) and upserts into Vectorize.     |
| `GET /health`  | Liveness, models, limits, tool names, and which secrets are set (never their values).           |

### `POST /chat`

Request: `{ messages: [{ role: "user" | "assistant", content }], turnstileToken?, sessionToken? }`.
The first message of a session needs a Turnstile token; the reply's `session` event carries
a signed token (30 minutes) to send as `sessionToken` afterwards.

Response (`text/event-stream`):

| Event     | Data                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `session` | `{ token, expiresAt }`, only when a new session was issued               |
| `status`  | `{ tool, label, round }` per tool call, e.g. `"Looking up projects…"`    |
| `token`   | `{ text }`, the answer in pieces                                         |
| `sources` | `{ sources: [{ title, href }] }`, always sent, only links tools returned |
| `done`    | `{ rounds, model }`                                                      |
| `error`   | `{ error, message }` if the model failed mid-stream (then `sources: []`) |

Errors before the stream are JSON `{ error, message }`: `400 bad_request`,
`413 too_long` (over 500 characters), `401 turnstile_required`, `403 turnstile_failed`,
`403 forbidden_origin`, `429 rate_limited` (with `Retry-After`), `429 daily_limit`
(the "back tomorrow" message), `503 not_configured`.

## The agent

- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with Workers AI function calling;
  `@cf/meta/llama-3.1-8b-instruct` if a call fails (`CHAT_MODEL`, `CHAT_MODEL_FALLBACK`).
- At most **3 tool rounds** per turn (up to 4 calls each), then one call without tools
  that must answer. `max_tokens` 400 on every call.
- Tools (all read-only, zod-validated; bad arguments go back to the model as a tool error):

| Tool                          | Source                                                           |
| ----------------------------- | ---------------------------------------------------------------- |
| `list_projects()`             | `data/site.json` (generated from `src/content/work`)             |
| `get_project(slug)`           | `data/site.json`                                                 |
| `get_experience()`            | `data/site.json` (from `src/data/experience.json`)               |
| `get_contact()`               | `data/site.json` (from `src/lib/site.ts`); never availability    |
| `get_github_stats(range?)`    | `SITE_URL/api/activity`; `range` is `year` (default) or `recent` |
| `get_popular_projects(days?)` | `SITE_URL/api/popular?days=` (1 to 30, default 7)                |
| `search_knowledge(query)`     | bge-m3 embedding, Vectorize top 5, score ≥ `MIN_SCORE`           |

- Enforced in code, not only in the prompt: sources are the links tools returned (never
  URLs the model writes); when no tool returned data the answer is a fixed "I don't know"
  (this also covers off-topic requests); Talentnet content is only what the site publishes.

## Content

`pnpm corpus` reads the Astro repo's real content (`src/lib/site.ts`,
`src/data/experience.json`, `src/content/work/*.md`) and writes `data/site.json`, which is
bundled into the Worker and committed. CI fails if it is stale. `todo` fields are left out.
Talentnet case studies are already CV-level (`confidential: true`); nothing else is read.

`pnpm ingest --dry-run` lists the documents; `CHAT_URL=… INGEST_SECRET=… pnpm ingest`
sends them to `/ingest`. The `Chat ingest` workflow does this on merge to `main` once its
secrets exist.

## Develop and test

```sh
pnpm install
pnpm test        # vitest in workerd (Miniflare); AI, Vectorize, Turnstile and site APIs mocked
pnpm typecheck
cp .dev.vars.example .dev.vars && pnpm dev   # wrangler dev: AI and Vectorize need a Cloudflare login
```

## Before the first deploy

Nothing below exists yet. Create it, then replace `REPLACE_ME` in `wrangler.jsonc`.

1. **Worker** `portfo-chat` (created by the first `wrangler deploy`). Route: `*.workers.dev`
   or a custom domain such as `chat.<domain>`.
2. **Vectorize index**: `wrangler vectorize create portfo-chat --dimensions=1024 --metric=cosine`
   (bge-m3). Bound as `VECTORIZE`.
3. **Durable Object** `Quota` (SQLite-backed, binding `QUOTA`, migration `v1`): created by
   the deploy, no separate step. Holds the per-visitor window and the daily budget. No KV.
4. **Rate Limiting binding** `CHAT_BURST_LIMITER`: `namespace_id` `1001`, 3 per 10 s.
   Created by the deploy (the namespace id is chosen, not provisioned).
5. **Workers AI** binding `AI`: on by default for the account.
6. **Turnstile widget** (Managed) with the site's production hostname, any preview
   hostnames, and `localhost`. Gives `PUBLIC_TURNSTILE_SITE_KEY` (Vercel) and
   `TURNSTILE_SECRET_KEY` (Worker). The contact form can share it.
7. **Worker secrets**: `wrangler secret put TURNSTILE_SECRET_KEY`, `INGEST_SECRET`,
   `SESSION_SIGNING_KEY` (`openssl rand -base64 32` for the last two).
8. **Worker vars** in `wrangler.jsonc`: `ALLOWED_ORIGINS` (production origin, plus preview
   origins if wanted) and `SITE_URL` (the production site).
9. AI Gateway: not used.
