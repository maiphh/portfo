# portfo-chat

The chat agent for Mai Gia Phu's portfolio, as its own Cloudflare Worker. The Astro site
stays on Vercel; the chat window (next PR) and the ink-dot mascot (the one after) call
this Worker. Deployed at `https://portfo-chat.poet-ung-ho.workers.dev` with the top-level
(localhost-only) config; see [Environments and the deploy guard](#environments-and-the-deploy-guard).

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
  `@cf/meta/llama-3.1-8b-instruct` if a call fails (`CHAT_MODEL`, `CHAT_FALLBACK_MODEL`).
- At most **3 tool rounds** per turn (up to 4 calls each), then one call without tools
  that must answer. `max_tokens` 400 on every call. All of these are
  [runtime knobs](#runtime-knobs).
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

## Runtime knobs

Plain `vars` in `wrangler.jsonc` (no secrets), read and validated on every request, so a
change needs only a deploy (or `wrangler dev --var NAME:value` locally). A missing or invalid
value falls back to its default; a whole number outside its range is clamped to the range
(`"5000"` → `1000`); anything else (`"lots"`, `"3.5"`, `"1e3"`) uses the default. Models must
be Workers AI ids starting with `@cf/`. `GET /health` reports the active values.

| Var                   | Default                                    | Range         | Effect                                                                                                                             |
| --------------------- | ------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `CHAT_MODEL`          | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | any `@cf/` id | The model for every chat and tool-calling call. Must support Workers AI function calling.                                          |
| `CHAT_FALLBACK_MODEL` | `@cf/meta/llama-3.1-8b-instruct`           | any `@cf/` id | Retried once when a `CHAT_MODEL` call throws. Same value as `CHAT_MODEL` disables the fallback.                                    |
| `DAILY_MESSAGE_CAP`   | `50`                                       | 1 to 1000     | Messages per day across all visitors (Ho Chi Minh City day). After it, `429 daily_limit` ("back tomorrow"). The main cost control. |
| `VISITOR_LIMIT`       | `10`                                       | 1 to 100      | Messages per visitor per 10 minutes (`429 rate_limited` with `Retry-After`). The 3-per-10 s burst limit is fixed in `ratelimits`.  |
| `MAX_TOOL_ROUNDS`     | `3`                                        | 1 to 5        | Tool-calling rounds per turn (up to 4 calls each) before one forced answer without tools. Each round is one more model call.       |
| `MAX_TOKENS`          | `400`                                      | 64 to 2048    | `max_tokens` on every model call. Caps answer length and output cost.                                                              |

Not knobs: `MIN_SCORE` (Vectorize match threshold, `0.35`), the 500-character input cap,
the 30-minute session. `CLASSIFY_MODEL` (the contact-form classifier) is a Vercel env var of
the Astro site, not a Worker var.

### Cost

Workers AI bills in Neurons: 10,000 free per day on both plans (reset 00:00 UTC), then
$0.011 per 1,000 on Workers Paid; on Workers Free, calls fail once the allowance is used.
A turn makes 1 + (tool rounds) model calls, and every call resends the system prompt, the
tool definitions and the tool results so far, so the cost is mostly **input** tokens.

Rough estimate for a typical turn (2 to 3 calls, ~9,000 input and ~300 output tokens), from
the [pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/) on 2026-10-20:

| `CHAT_MODEL`                               | Neurons per M in / out | Per turn | At cap 50 / day                                                                                    |
| ------------------------------------------ | ---------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 26,668 / 204,805       | ~300     | ~15,000: over the free 10,000 (~$0.06/day on Paid; up to ~$0.30/day if every turn uses all rounds) |
| `@cf/meta/llama-3.1-8b-instruct`           | 25,608 / 75,147        | ~250     | ~12,500: also near or over the free allowance (input is priced like 70B)                           |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast`  | 4,119 / 34,868         | ~50      | ~2,500: well inside the free allowance                                                             |

So with 70B, keep a full day near $0 with `DAILY_MESSAGE_CAP` around 25 to 30, or
`MAX_TOOL_ROUNDS` 2. A small 8B model at cap 50 stays near $0 only in its `fp8-fast`
variant; its tool-calling quality is unverified here. bge-m3 embeddings for
`search_knowledge` are negligible (~1,075 Neurons per M tokens). Check the dashboard after
launch: these are estimates, not measurements.

## Content

`pnpm corpus` reads the Astro repo's real content (`src/lib/site.ts`,
`src/data/experience.json`, `src/content/work/*.md`) and writes `data/site.json`, which is
bundled into the Worker and committed. CI fails if it is stale. `todo` fields are left out.
Talentnet case studies are already CV-level (`confidential: true`); nothing else is read.

`pnpm ingest --dry-run` lists the documents; `CHAT_URL=… INGEST_SECRET=… pnpm ingest`
sends them to `/ingest`. The `Chat ingest` workflow does this on merge to `main` once its
secrets exist.

### Ingest is idempotent

Chunk ids are `<doc>:<i>` and every chunk's metadata records `n`, the doc's chunk count at
that ingest. Before upserting, `/ingest` reads each doc's `<doc>:0` (one `getByIds` call) and
deletes only `<doc>:<newN>` … `<doc>:<oldN − 1>`: re-sending the same docs deletes nothing,
and a doc that shrinks loses only its tail. Chunks written before `n` existed are handled
by probing the tail ids with `getByIds` and deleting only the ids that come back (one time;
the next ingest has `n`). The response reports `{ chunks, deleted }`.

Vectorize limits: `deleteByIds` takes at most **100 ids per call** (error 40007), so deletes
go in batches of 100; `getByIds` uses the same cap (its limit is not documented). Upserts go
in batches of 500 (the Workers limit is 1000 per call). A doc removed from the corpus
entirely is not cleaned up automatically: delete its ids with `wrangler vectorize
delete-vectors portfo-chat --ids <doc>:0 …`.

## Develop and test

```sh
pnpm install
pnpm test        # vitest in workerd (Miniflare); AI, Vectorize, Turnstile and site APIs mocked
pnpm typecheck
cp .dev.vars.example .dev.vars && pnpm dev   # wrangler dev: AI and Vectorize need a Cloudflare login
```

## Environments and the deploy guard

| Config                       | Deploy with                        | `ALLOWED_ORIGINS`                   | `SITE_URL`           |
| ---------------------------- | ---------------------------------- | ----------------------------------- | -------------------- |
| top level (deployed today)   | `wrangler deploy --env=""`         | `http://localhost:4321`             | `""` (empty)         |
| `env.production` (at launch) | `wrangler deploy --env production` | TODO: `https://<production domain>` | TODO: same, no slash |

- The **top level** is exactly what is deployed now. Change it only together with the
  dashboard, so the file and the live Worker don't drift again.
- **`env.production`** deploys to the same Worker (`"name": "portfo-chat"`), so the URL and
  the secrets stay. wrangler does not inherit `vars` or bindings into an environment, so
  `env.production` repeats them all; a test checks they match the top level. Its two
  `REPLACE_ME_SITE_DOMAIN` values are the launch TODOs.
- With `SITE_URL` empty, `get_github_stats` and `get_popular_projects` return a tool error
  ("The site URL is not configured.") without any request, and the agent answers with the
  fixed "I don't know" reply. Tests cover both tools and the agent.

**Deploy guard.** `build.command` runs `node scripts/check-config.ts` (with `--env production`
for that environment) before every `wrangler deploy` and `wrangler versions upload`. It fails
the deploy if any value in the effective config matches `REPLACE_ME`, and for production also
if `SITE_URL` is not `https://…` or `ALLOWED_ORIGINS` has no `https://` origin. Under
`wrangler dev` it only prints. Run it by hand with `pnpm check:config` or
`pnpm check:config --env production`, **including before any upload that doesn't go through
wrangler** (API or dashboard), since the guard can't run there. CI runs `pnpm check:config`,
and `test/config-guard.test.ts` tests the checker and the committed file.

**Turnstile** is localhost-only today. Before launch, add the production hostname (and any
preview hostnames) to the Turnstile widget, or the first message from the real site fails
with `403 turnstile_failed`.

## Before the first deploy

Done for the current deployment (kept for a fresh account). Then fill in `env.production`.

1. **Worker** `portfo-chat` (created by the first `wrangler deploy`). Route: `*.workers.dev`
   or a custom domain such as `chat.<domain>`.
2. **Vectorize index**: `wrangler vectorize create portfo-chat --dimensions=1024 --metric=cosine`
   (bge-m3). Bound as `VECTORIZE`.
3. **Durable Object** `Quota` (SQLite-backed, binding `QUOTA`, migration `v1`): created by
   the deploy, no separate step. Holds the per-visitor window and the daily budget. No KV.
4. **Rate Limiting binding** `CHAT_BURST_LIMITER`: `namespace_id` `1001`, 3 per 10 s.
   Created by the deploy (the namespace id is chosen, not provisioned).
5. **Workers AI** binding `AI`: on by default for the account.
6. **Turnstile widget** (Managed) with `localhost` and, before launch, the site's production
   hostname and any preview hostnames. Gives `PUBLIC_TURNSTILE_SITE_KEY` (Vercel) and
   `TURNSTILE_SECRET_KEY` (Worker). The contact form can share it.
7. **Worker secrets**: `wrangler secret put TURNSTILE_SECRET_KEY`, `INGEST_SECRET`,
   `SESSION_SIGNING_KEY` (`openssl rand -base64 32` for the last two).
8. **Worker vars** in `wrangler.jsonc`: for launch, fill `ALLOWED_ORIGINS` (production
   origin, plus preview origins if wanted) and `SITE_URL` (the production site) in
   `env.production`. The runtime knobs already have their defaults in both blocks.
9. AI Gateway: not used.
