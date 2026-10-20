# Portfo

The portfolio of **Mai Gia Phu**, AI Engineer in Ho Chi Minh City.

The design idea is "the document under parse". The hero is my CV, scanned and boxed field by field into JSON. Two pinned, scroll-scrubbed chapters show the document OCR pipeline and the legal RAG assistant at work, and every drawn object is named by a tag or a leader line. Lime only ever means "detected" and violet only ever means "cited".

## Stack

- [Astro 7](https://astro.build) + TypeScript (strict), static output. Pages are prerendered. Only `/api/*` routes run on demand (`export const prerender = false`).
- `@astrojs/vercel` adapter, `@astrojs/sitemap`, `@astrojs/mdx`.
- [GSAP](https://gsap.com) from npm (ScrollTrigger, SplitText, MotionPathPlugin) for motion. Plain CSS tokens in `src/styles/global.css`.
- Self-hosted variable fonts via Fontsource: Hubot Sans (display, with the `wdth` axis), Familjen Grotesk (body) and JetBrains Mono (data). All three include Vietnamese subsets.
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) for every model call: the chat agent (Llama 3.3 70B with tool calling, bge-m3 embeddings, Vectorize) runs in its own Worker in [`workers/chat`](workers/chat/README.md), and the contact worker sorts messages with a small Llama over the Workers AI REST API. No AI SDK.
- ESLint (typescript-eslint + eslint-plugin-astro), Prettier (prettier-plugin-astro), `astro check`.
- GitHub Actions CI on every push to `main` and every PR: install, lint, check, build, plus migrations and DB tests against a throwaway Postgres + pgvector service container.
- Database layer (not wired to the UI yet): Drizzle ORM + drizzle-kit, `@neondatabase/serverless`, schema and migrations in `src/db` and `drizzle/`.

The backend is described in [`docs/architecture.md`](docs/architecture.md): Neon Postgres, a Postgres jobs table, the GitHub sync, Turnstile and rate limits, and the chat Worker on Cloudflare.

## Scripts

Needs Node 22.22+ (see `.nvmrc`) and pnpm 10 (`corepack enable`).

| Command            | What it does                                                               |
| ------------------ | -------------------------------------------------------------------------- |
| `pnpm install`     | Install dependencies                                                       |
| `pnpm dev`         | Dev server at http://localhost:4321                                        |
| `pnpm build`       | Production build (`.vercel/output`)                                        |
| `pnpm preview`     | Serve the built static output locally (no `/api` routes; use `vercel dev`) |
| `pnpm lint`        | ESLint + Prettier check                                                    |
| `pnpm lint:fix`    | Auto-fix lint and formatting                                               |
| `pnpm check`       | `astro check` (types, content schemas, `.astro` files)                     |
| `pnpm verify`      | lint + check + build, the same as CI                                       |
| `pnpm test`        | Vitest DB tests (needs `TEST_DATABASE_URL`, see [Database](#database))     |
| `pnpm db:generate` | Write a new SQL migration in `drizzle/` from `src/db/schema.ts`            |
| `pnpm db:migrate`  | Apply pending migrations to `DATABASE_URL`                                 |

## Structure

```
src/
  components/      One component per home-page section or chapter
    Hero.astro         CV sheet + extract.json rail (scan, boxes, leader lines)
    WorkIntro.astro    "Work" opener + most-read list
    ChapterOcr.astro   Pinned chapter: invoice → boxes → rule → JSON fields
    ChapterRag.astro   Pinned chapter: Điều › Khoản › Điểm tree, chunks, cited answer
    Craftland.astro    Isometric island of 14 game modes
    SideProjects.astro OpenPortfo chart, Mirror Now template, Poet
    Timeline.astro     96-month work/study/awards grid
    Activity.astro     GitHub activity
    HowItWorks.astro   Architecture graph
    Contact.astro      Contact band, form and job queue
  content/work/    Case studies (Markdown/MDX), one file per project
  data/            experience.json (CV entries for the timeline)
  content.config.ts  Zod schemas for the `work` and `experience` collections
  layouts/Base.astro
  lib/
    flags.ts         Feature flags (PUBLIC_USE_MOCKS)
    types.ts         Data contracts the real APIs will return
    mocks/           Typed sample data (views, GitHub, contact)
  server/            Server-only code for /api routes (contact pipeline, cron, Turnstile)
    data.ts          Build-time data access: mocks today, APIs later
  pages/
    index.astro      Home
    work/[slug].astro Case-study pages
    404.astro
    api/health.ts    On-demand function (proves the /api wiring)
  scripts/         Client code: features.ts (works without motion), motion.ts (GSAP), home.ts (entry)
  styles/global.css Design tokens and all styles
docs/architecture.md  v1 backend plan
workers/chat/      portfo-chat: the chat agent Worker (Cloudflare Workers AI + Vectorize), its own package
```

## Add a case study

1. Create `src/content/work/<slug>.md` (or `.mdx`). The slug becomes `/work/<slug>`.
2. Fill in the frontmatter. The schema in `src/content.config.ts` validates it at build time:

   ```yaml
   ---
   title: Short name for lists
   headline: The display headline.
   summary: One or two plain sentences (also the meta description).
   org: Who it was for
   meta: [Chips, Under, The, Headline]
   period: Jan 2026 – now # optional
   order: 7 # position on the home page
   anchor: work-<slug> # section id on the home page
   steps: # optional; [[term]] marks a Vietnamese legal term
     - { title: Step title, body: One sentence. }
   facts: # optional headline numbers
     - { value: ">98%", label: accuracy, count: 98, prefix: ">", suffix: "%" }
   confidential: false # true = CV-level facts only, no code links or screenshots
   links: [{ label: Live site, href: "https://example.com" }]
   todo: [Anything still to confirm]
   ---
   ```

3. Write the body in Markdown. Only state facts you can stand behind: no invented metrics, links or testimonials.
4. To feature it on the home page, render it from `src/pages/index.astro` with a section component (see `SideProjects.astro`).

Talentnet work stays at CV level. Don't add internal code, documents or screenshots.

## Sample data and the mock flag

The contact form, the most-read list and GitHub activity are wired to real backends (see [Contact form](#contact-form), [Analytics](#analytics) and [GitHub sync](#github-sync)). The chat is a separate Cloudflare Worker ([Chat](#chat)); its window and mascot land in later PRs. While `PUBLIC_USE_MOCKS` is `true` (the default), they render **clearly labelled sample data** from `src/lib/mocks/*`. Every sample figure carries a † and a visible "sample" note, and the contact form says that nothing is sent.

Set `PUBLIC_USE_MOCKS=false` to use the real contact form, live view counts and GitHub activity, and to see the honest empty states for the rest ("not connected yet"). Each real API will replace one mock module and return the shapes in `src/lib/types.ts`, in this order (see `docs/architecture.md`):

1. DB foundation (Neon, Drizzle schema, migrations, jobs + rate limits)
2. Contact form + worker + Resend (done: `/api/contact`)
3. Analytics beacon + most-viewed (done: `/api/view`, `/api/popular`)
4. GitHub sync (done: `/api/cron/github-sync`, `/api/activity`)
5. Chat agent on Cloudflare Workers AI (Worker done: `workers/chat`; window and mascot next)

Add `?dev` to the URL (with mocks on) to see the open content TODOs.

## Environment

Copy `.env.example` to `.env` for local work. **Never commit `.env` or any secret.** In production, set the variables in the Vercel project settings. Only `PUBLIC_*` variables reach the browser.

`DATABASE_URL`, `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_API_TOKEN` (Workers AI: Read), `GITHUB_TOKEN`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `CRON_SECRET`, `VISITOR_HASH_SALT`, plus optional `SITE_URL`, `RESEND_FROM`, `GITHUB_LOGIN`, `CLASSIFY_MODEL`, `PUBLIC_CHAT_URL` and `PUBLIC_USE_MOCKS`. None are needed for the build. With mocks off, the contact form, analytics and GitHub activity need `DATABASE_URL`, and in production also `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY` and `VISITOR_HASH_SALT` (they fail closed without them; `/api/view` answers 503 without the salt). The worker needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN`, `RESEND_API_KEY` and `NOTIFY_EMAIL`, and the crons need `CRON_SECRET`. The GitHub sync needs `GITHUB_TOKEN`.

## Database

Neon Postgres + pgvector, following [`docs/architecture.md`](docs/architecture.md). The UI doesn't use it yet; it still renders the mocks.

- `src/db/schema.ts` defines all ten tables (`documents`, `chunks` with `vector(1536)` and an HNSW cosine index, `chat_logs`, `github_repos`, `github_activity`, `contact_messages`, `jobs`, `page_views`, `rate_limits`, `sync_runs`).
- `drizzle/` holds the generated SQL migrations. `0000_enable_pgvector.sql` runs `CREATE EXTENSION IF NOT EXISTS vector` before any table is created.
- `src/db/client.ts`: `getDb()` / `createDb(url)` read `DATABASE_URL`. A `*.neon.tech` host uses the `@neondatabase/serverless` driver (WebSockets, transactions work in serverless functions). Any other host uses node-postgres.
- `src/db/queue.ts`: the Postgres job queue. `enqueue`, `claim` (`FOR UPDATE SKIP LOCKED`, each claim counts as an attempt), `complete`, `fail` (exponential backoff from 30 s, capped at 1 h; `failed` after 5 attempts), and `requeueStale` for a sweeper.
- `src/db/rate-limit.ts`: fixed-window limits. `hitRateLimit(db, { key, limit, windowMs })` does one atomic upsert per hit, and `pruneRateLimits` cleans up old windows.

### Point it at Neon and run migrations

1. In the Neon console, create a project (Postgres 17) and copy the **pooled** connection string from _Connect_. It looks like `postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`.
2. Put it in `.env` as `DATABASE_URL=...`. `.env` is git-ignored, so never commit it. For production, set the same variable in the Vercel project settings.
3. Run `pnpm db:migrate`. drizzle-kit reads `DATABASE_URL` (it loads `.env` itself), enables `vector` and creates the tables. It records what it applied in `drizzle.__drizzle_migrations`, so running it again is a no-op. Neon supports pgvector, and the role Neon creates may run `CREATE EXTENSION`.
4. To change the schema, edit `src/db/schema.ts`, run `pnpm db:generate`, review the new SQL in `drizzle/`, commit it, then run `pnpm db:migrate`. CI fails if the schema and the committed migrations drift apart.

### Tests

`pnpm test` runs Vitest against a real Postgres with pgvector. It needs `TEST_DATABASE_URL` pointing at a **throwaway local** database: the setup drops and recreates the `public` schema, then applies the migrations from `drizzle/`. It refuses non-local hosts. The quickest local database is Docker:

```sh
docker run -d --name portfo-pg -e POSTGRES_PASSWORD=portfo -p 5432:5432 pgvector/pgvector:pg17
TEST_DATABASE_URL=postgresql://postgres:portfo@localhost:5432/postgres pnpm test
```

A local install works too (for example `postgresql-17` plus `postgresql-17-pgvector` from the PGDG apt repo). CI runs the same tests against a `pgvector/pgvector:pg17` service container, so no database secret is needed.

## Contact form

With `PUBLIC_USE_MOCKS=false` the form posts to `POST /api/contact` (an on-demand function). With mocks on, it keeps the labelled sample queue and sends nothing.

1. **Request** (`src/server/contact/submit.ts`): the honeypot field (`website`) gets a fake success and nothing is stored. Next comes zod validation (name, email, message up to 2000 characters, optional role) using the same rules and messages as the inline client errors, then Turnstile verification, then the rate limit: 3 posts per `visitor_hash` per day. `visitor_hash` is SHA-256 of IP + UA + `VISITOR_HASH_SALT` combined with the calendar date in Asia/Ho_Chi_Minh (the same day boundary analytics uses). The message and a `classify_and_notify` job are inserted in **one transaction**.
2. **Kick**: the endpoint starts the worker right away with `waitUntil` from `@vercel/functions`, falling back to fire-and-forget outside Vercel, so the response doesn't wait for the LLM.
3. **Worker** (`src/server/contact/worker.ts`): claims jobs with `FOR UPDATE SKIP LOCKED` and classifies the message with Cloudflare Workers AI over the REST API (`@cf/meta/llama-3.1-8b-instruct` in JSON mode, `CLASSIFY_MODEL` to override), validated with zod. The output is JSON: `{ category: recruiter | client | other | spam, confidence }`. It stores the result, then emails `NOTIFY_EMAIL` through Resend unless the message is spam. Failures retry with exponential backoff, and after 5 attempts the job and the message are marked `failed`. A retry skips steps that already succeeded, and the Resend idempotency key prevents duplicate emails. Classification and email sit behind the `Classifier` and `Notifier` interfaces, so tests use fakes and make no network calls.
4. **Sweeper**: `GET /api/cron/jobs` with `Authorization: Bearer $CRON_SECRET` re-queues jobs stuck in `running` for over 10 minutes, then processes pending ones. It returns 503 if `CRON_SECRET` is unset. `vercel.json` schedules it daily at 03:00 UTC. That is only a **fallback**, because each post already kicks the worker and Vercel Hobby cron runs at most daily. A more frequent GitHub Actions schedule can call the same URL.

Turnstile: without `TURNSTILE_SECRET_KEY`, verification is skipped in dev and test, with a log line. In production (`VERCEL_ENV` or `NODE_ENV` = `production`) every post is rejected (fail closed). Preview deployments also run with `NODE_ENV=production`, so give them keys too; Cloudflare's [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) work there. The widget renders only when `PUBLIC_TURNSTILE_SITE_KEY` is set and mocks are off.

Without JavaScript the form is a plain POST, and `/api/contact` answers with a small accessible result page: sent, field errors, rate limited, or unavailable. With JavaScript it uses `fetch` and shows inline, `aria-describedby`-linked errors and a live status line.

Try it locally (needs a local Postgres, see [Database](#database)):

```sh
DATABASE_URL=postgresql://... pnpm db:migrate
PUBLIC_USE_MOCKS=false DATABASE_URL=postgresql://... pnpm dev
```

Without AI or Resend keys, messages are stored and the job retries with backoff until the keys are set.

## Analytics

Cookie-free page views for the "Most read this week" list. Only active with `PUBLIC_USE_MOCKS=false`; with mocks on, the list shows the labelled † sample counts and no beacon is sent.

- **Beacon** (`src/scripts/analytics.ts`): case-study pages (`/work/<slug>`) send one view on load. On the home page a project section counts once it reaches the middle band of the screen (`data-slug`). The script uses `navigator.sendBeacon` with a JSON body and falls back to `fetch(..., { keepalive: true })`. It sends nothing when the browser has Do Not Track or Global Privacy Control on.
- **`POST /api/view`** (`src/server/analytics/view.ts`) takes `{ slug, referrer_host? }` as JSON, as a sendBeacon text body, or form-encoded, up to 2 KB. The slug must be a known case study (400 otherwise), and a referrer host that isn't a plain hostname is dropped. Bots and empty user agents are ignored. `visitor_hash` = SHA-256(IP + UA + `VISITOR_HASH_SALT`:day); no IP, cookie or ID is stored. The limit is 60 beacons per visitor per hour (429 above that). Statuses: 204 for a new view, 202 for a duplicate or ignored one, 503 when the salt is missing in production (fail closed).
- **Dedupe**: one row per `visitor_hash` + `slug` + day, enforced by the unique index `page_views_visitor_slug_day_key` (migration `0002`) and `ON CONFLICT DO NOTHING`. "Day" is the calendar day in **Asia/Ho_Chi_Minh** (UTC+7, no DST), the site owner's time zone. The salt rotates on the same boundary, so a visitor can't be linked across days.
- **`GET /api/popular`** (`src/server/analytics/popular.ts`) returns `{ items: ViewCount[], since, days }`: deduped views per case study over the last 7 days (or `?days=1..30`, which the chat's `get_popular_projects` tool uses), highest first (ties by slug). `ViewCount` is the same shape the mocks use (`slug`, `title`, `href`, `views`). It sends `Cache-Control: public, max-age=0, s-maxage=30, stale-while-revalidate=30`, so the edge serves it for about 30 s, and it answers 503 with `items: []` when the database is unavailable.
- **UI**: the home list fetches `/api/popular` and refreshes every 30 s while the tab is visible. With no data it says "Not enough reads yet this week". When the API fails or JavaScript is off it says "View counts appear here once analytics is connected". It never shows sample numbers.

## GitHub sync

With `PUBLIC_USE_MOCKS=false` the Activity section ("What I'm building lately") loads live data from `GET /api/activity`. With mocks on it keeps the labelled † sample.

- **Sync** (`src/server/github/sync.ts`): `GET|POST /api/cron/github-sync` with `Authorization: Bearer $CRON_SECRET`. It answers 401 for a missing or wrong token and 503 when `CRON_SECRET` is unset, in any environment (the same rule as `/api/cron/jobs`).
  - Each run is logged in `sync_runs` (`kind = 'github'`, `started_at`, `finished_at`, `status`, `error`). A run already in progress blocks a new one (409) for up to 10 minutes.
  - It reads the user's (`GITHUB_LOGIN`, default `maiphh`) public repos and 53 weeks of contributions through the GitHub GraphQL API, in windows of 91 days or less.
  - It replaces `github_repos` and `github_activity` in one transaction, so a second run is a no-op and a failed run leaves the previous snapshot in place.
  - Without `GITHUB_TOKEN` the run is recorded as `failed` and the endpoint answers 503. GitHub errors give `failed` plus 502.
- **Filter**: only the owner's **public, non-fork, non-archived** repos are stored. Their stars, language, up to 10 topics, `pushed_at` and description are kept, along with daily commit, PR and issue counts in `github_activity`, rolled up per Asia/Ho_Chi_Minh day. Contributions to other people's repos and anything private are dropped, so the counts are lower than GitHub's own profile graph. Nothing from private or work (Talentnet) repos is stored.
- **Token**: a fine-grained token with read-only access to public repositories (or a classic token with no scopes). It goes in the Vercel env as `GITHUB_TOKEN` and is never committed.
- **Read API** (`src/server/github/activity.ts`): `GET /api/activity` returns `{ status: "ok", summary: GithubSummary, repos }`, where `summary` has the same shape the sample uses (`src/lib/types.ts`) and `repos` holds the 6 most recently pushed repos.
  - The heatmap is 52 Sunday-first weeks ending this week, levelled by quartile of the busiest day. The streak counts back from today, or from yesterday when today has nothing yet. The feed is the newest 4 repo-days from the last 14 days.
  - It returns `{ status: "empty" }` before the first successful sync or when no repos are stored, and 503 with `{ status: "unavailable" }` when the database is down. It sends `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=60`.
  - The page shows "No GitHub activity synced yet" or "…once the GitHub sync is connected" instead of numbers. Without JavaScript it links to GitHub and says the activity loads with JavaScript.
- **Schedule**: `.github/workflows/github-sync.yml` runs every 6 hours (`17 */6 * * *` UTC) and on manual dispatch. Manual runs are dry by default. It needs the Actions secrets `SITE_URL` and `CRON_SECRET`; until both are set, it logs a notice and exits successfully. `vercel.json` also schedules the sync daily at 21:00 UTC (04:00 UTC+7) as a fallback, because Vercel Hobby crons run at most daily and Vercel Cron sends the `CRON_SECRET` bearer itself.

Try it locally (no GitHub call without a token):

```sh
CRON_SECRET=dev GITHUB_TOKEN=... PUBLIC_USE_MOCKS=false DATABASE_URL=postgresql://... pnpm dev
curl -X POST -H "Authorization: Bearer dev" http://localhost:4321/api/cron/github-sync
```

## Chat

The chat is an agent in its own Cloudflare Worker, `portfo-chat`, in [`workers/chat`](workers/chat/README.md), with its own `package.json`, lockfile, tests and `wrangler.jsonc`. The Astro site stays on Vercel; the chat window (next PR) calls the Worker at `PUBLIC_CHAT_URL`.

- `POST /chat` runs an agent loop on Workers AI function calling (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/meta/llama-3.1-8b-instruct` as the fallback), with at most 3 tool rounds, then a forced answer. It streams SSE: `session`, `status` per tool call, `token`, `sources`, `done`.
- Seven read-only tools: `list_projects`, `get_project`, `get_experience`, `get_contact` (from `workers/chat/data/site.json`, generated from this repo's content by `pnpm corpus`), `get_github_stats` and `get_popular_projects` (from this site's `/api/activity` and `/api/popular`), and `search_knowledge` (bge-m3 + Vectorize).
- Guards: Turnstile on a session's first message, then a signed session token; 3 messages per 10 s (Rate Limiting binding) and 10 per 10 minutes per visitor (Durable Object); 500-character questions, 400 `max_tokens`, top-k 5; a daily message budget.

```sh
cd workers/chat && pnpm install && pnpm test   # all bindings mocked, no Cloudflare account needed
```

After changing a case study or `src/data/experience.json`, run `pnpm corpus` in `workers/chat` and commit `data/site.json` (CI checks it is up to date).

## Deploy on Vercel

1. Import `maiphh/portfo` in Vercel. The framework preset is detected as Astro, the install command is `pnpm install`, and the build command is `pnpm build`.
2. Set the Node.js version to 22.x in Project Settings.
3. Add environment variables as features land. The canonical URL comes from `SITE_URL`, falling back to Vercel's production URL.
4. Every PR gets a preview deployment, and `main` deploys to production.

## Workflow

- No direct pushes to `main` after the initial commit.
- Every change goes on a feature branch (`feat/…`, `fix/…`) and a pull request. CI must pass, and the Vercel preview link is the review surface.
- **Phu approves and merges PRs.** Agents never merge.

## Accessibility and motion

- WCAG 2.2 AA contrast, a skip link, and keyboard-complete controls.
- `prefers-reduced-motion`: every animation has a readable final state, and the reduced-motion path shows final states with no movement.
- Without JavaScript the whole page is readable: the hero, both chapters in their final state, and a static SVG of the chart.
- Below 1024px the chapters stack and leader lines are hidden. Below 960px the nav collapses into a menu.
