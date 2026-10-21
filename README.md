# Portfo

The portfolio of **Mai Gia Phu**, AI Engineer in Ho Chi Minh City.

The design idea is "the document under parse". The hero is my CV, scanned and boxed field by field into JSON. Two pinned, scroll-scrubbed chapters show the document OCR pipeline and the legal RAG assistant at work, and every drawn object is named by a tag or a leader line. Lime only ever means "detected" and violet only ever means "cited".

## Stack

- [Astro 7](https://astro.build) + TypeScript (strict), static output. Pages are prerendered. Only `/api/health` runs on demand on Vercel.
- `@astrojs/vercel` adapter, `@astrojs/sitemap`, `@astrojs/mdx`.
- [GSAP](https://gsap.com) from npm (ScrollTrigger, SplitText, MotionPathPlugin) for motion. Plain CSS tokens in `src/styles/global.css`.
- Self-hosted variable fonts via Fontsource: Hubot Sans (display, with the `wdth` axis), Familjen Grotesk (body) and JetBrains Mono (data). All three include Vietnamese subsets.
- Two Cloudflare Workers:
  - [`workers/api`](workers/api) — `portfo-api`: contact, page views, GitHub activity on **D1** + Resend + Cron Trigger.
  - [`workers/chat`](workers/chat/README.md) — `portfo-chat`: chat agent on Workers AI + Vectorize.
- ESLint (typescript-eslint + eslint-plugin-astro), Prettier (prettier-plugin-astro), `astro check`.
- GitHub Actions CI: lint, check, build, site unit tests, Playwright e2e, and both Workers' typecheck + tests.

The split is in [`docs/architecture.md`](docs/architecture.md).

## Scripts

Needs Node 22.22+ (see `.nvmrc`) and pnpm 10 (`corepack enable`).

| Command         | What it does                                                   |
| --------------- | -------------------------------------------------------------- |
| `pnpm install`  | Install dependencies                                           |
| `pnpm dev`      | Dev server at http://localhost:4321                            |
| `pnpm build`    | Production build (`.vercel/output`)                            |
| `pnpm preview`  | Serve the built static output locally                          |
| `pnpm lint`     | ESLint + Prettier check                                        |
| `pnpm lint:fix` | Auto-fix lint and formatting                                   |
| `pnpm check`    | `astro check` (types, content schemas, `.astro` files)         |
| `pnpm verify`   | lint + check + build, the same as CI                           |
| `pnpm test`     | Vitest unit tests for remaining `src` pure tests (no database) |

## Structure

```
src/
  components/      One component per home-page section or chapter
  content/work/    Case studies (Markdown/MDX), one file per project
  data/            experience.json (CV entries for the timeline)
  lib/
    flags.ts         Feature flags (PUBLIC_USE_MOCKS)
    api.ts           PUBLIC_API_URL helpers
    types.ts         Data contracts the API Worker returns
    mocks/           Typed sample data (views, GitHub, contact, chat)
  pages/
    index.astro      Home
    work/[slug].astro Case-study pages
    api/health.ts    Tiny Vercel probe (no database)
  scripts/         Client code: features.ts, analytics.ts, activity.ts, chat/, …
  styles/global.css
docs/architecture.md
workers/
  api/             portfo-api: contact, views, GitHub (D1 + Resend + Cron)
  chat/            portfo-chat: chat agent (Workers AI + Vectorize)
```

## Sample data and the mock flag

While `PUBLIC_USE_MOCKS` is `true` (the default), contact, views, GitHub activity and chat render **clearly labelled sample data** from `src/lib/mocks/*` and make no network calls. Every sample figure carries a †.

Set `PUBLIC_USE_MOCKS=false` and set `PUBLIC_API_URL` / `PUBLIC_CHAT_URL` to use the real Workers. If `PUBLIC_API_URL` is empty while mocks are off, the UI shows honest empty/error states and does not throw.

Add `?dev` to the URL (with mocks on) to see the open content TODOs.

## Environment

Copy `.env.example` to `.env` for local work. **Never commit `.env` or any secret.** In production, set the same variables in the Vercel project settings. Only `PUBLIC_*` variables reach the browser.

| You want                      | Set                                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Site with sample data         | nothing (defaults)                                                                                                                     |
| Live contact / views / GitHub | `PUBLIC_USE_MOCKS=false`, `PUBLIC_API_URL`. Secrets live on the Worker (`workers/api/.dev.vars.example`). |
| Live chat                     | `PUBLIC_CHAT_URL`, `PUBLIC_USE_MOCKS=false`, plus `workers/chat` setup.                                                                |

There is **no** `DATABASE_URL`, `RESEND_*`, `GITHUB_TOKEN`, `CRON_SECRET`, or `VISITOR_HASH_SALT` on Vercel.

## Local API Worker

```sh
cd workers/api && pnpm install && pnpm test
wrangler login
wrangler d1 create portfo   # put the database_id into wrangler.jsonc (both top level and env.production)
cp .dev.vars.example .dev.vars
wrangler d1 migrations apply portfo --local
pnpm dev
```

The committed `database_id` is a local placeholder (`00000000-…0001`). Replace it after `wrangler d1 create portfo`. Top-level `ALLOWED_ORIGINS` stays `http://localhost:4321` so local deploy/dev works; `env.production` still has `REPLACE_ME` until launch.

## Contact form

With mocks off and `PUBLIC_API_URL` set, the form posts to `${PUBLIC_API_URL}/contact`. Order: honeypot → validate → visitor hash → INSERT → Resend in the same request → respond. Success copy: "Thanks. I'll read it myself." If Resend fails, the row stays and the form gets `email_failed` (502). No captcha, no job queue, no LLM classification, no daily message rate limit.

Without JavaScript the form navigates cross-origin to the Worker, which returns a small HTML result page.

## Analytics

Cookie-free page views. Beacons use `fetch(..., { keepalive: true })` to `${PUBLIC_API_URL}/view` (not `sendBeacon`; cross-origin JSON beacons are unreliable). One row per visitor + slug + Asia/Ho_Chi_Minh day. `GET /popular` powers "Most read this week" and the chat tool.

## GitHub sync

Cron Trigger on `portfo-api` (`17 */6 * * *`). Manual: `POST /cron/github-sync` with `Authorization: Bearer $CRON_SECRET`. The Activity section loads `${PUBLIC_API_URL}/activity`.

## Chat

See [`workers/chat/README.md`](workers/chat/README.md). Tools `get_github_stats` and `get_popular_projects` call `API_URL` (the portfo-api origin). Empty `API_URL` → tool error, agent says it doesn't know.

```sh
cd workers/chat && pnpm install && pnpm test
```

After changing a case study, also run `pnpm work` in `workers/api` (updates `data/work.json`) and `pnpm corpus` in `workers/chat` (updates `data/site.json`). CI checks both are fresh.

## Deploy on Vercel

1. Import `maiphh/portfo` in Vercel. Framework preset Astro, install `pnpm install`, build `pnpm build`.
2. Node.js 22.x. Set `PUBLIC_USE_MOCKS`, `PUBLIC_API_URL`, `PUBLIC_CHAT_URL` (and optional `SITE_URL`).
3. Deploy the two Workers separately with wrangler (`workers/api`, `workers/chat`).

## Workflow

- No direct pushes to `main` after the initial commit.
- Every change goes on a feature branch (`feat/…`, `fix/…`) and a pull request. CI must pass, and the Vercel preview link is the review surface.
- **Phu approves and merges PRs.** Agents never merge.

## Accessibility and motion

- WCAG 2.2 AA contrast, a skip link, and keyboard-complete controls.
- `prefers-reduced-motion`: every animation has a readable final state.
- Without JavaScript the whole page is readable.
- Below 1024px the chapters stack and leader lines are hidden. Below 960px the nav collapses into a menu.
