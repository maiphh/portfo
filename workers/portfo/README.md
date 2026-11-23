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

## Support moderation and retention

Review submissions are private until approved. Use a dedicated `SUPPORT_ADMIN_TOKEN` and
server-to-server requests without an Origin header. Replace the placeholders locally; do not
paste credentials into source control or share them in command history.

```sh
curl -H "Authorization: Bearer $SUPPORT_ADMIN_TOKEN" "$WORKER_URL/api/support/admin/reviews?status=pending"
curl -X POST -H "Authorization: Bearer $SUPPORT_ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"action":"approve"}' "$WORKER_URL/api/support/admin/reviews/<review-id>"
# Other actions: reject (pending), hide (approved).
curl -H "Authorization: Bearer $SUPPORT_ADMIN_TOKEN" "$WORKER_URL/api/support/admin/donations"
curl -X POST -H "Authorization: Bearer $SUPPORT_ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"action":"hide_supporter"}' "$WORKER_URL/api/support/admin/donations/<donation-id>"
```

Donation messages are visible only to this admin endpoint. Hiding a name does not change payment
status. The scheduled job independently clears private messages and checkout artifacts after 30
days from payment or creation, IP digests after 24 hours, rate counters after 48 hours, and
rejected/hidden content after 30 days. Each run handles up to 500 records per category. Minimal
payment and replay records remain for reconciliation; Phu must approve final retention. Rotating
`SUPPORT_REVIEW_SIGNING_KEY` invalidates outstanding signatures; eligible donors can reclaim a
token signed with the current key during the seven-day window. Coordinate rotation accordingly.
