# Portfo

The portfolio of **Mai Gia Phu**, AI Engineer in Ho Chi Minh City.

The design idea is "the document under parse". The hero is my CV, scanned and boxed field by field into JSON. Two pinned, scroll-scrubbed chapters show the document OCR pipeline and the legal RAG assistant at work, and every drawn object is named by a tag or a leader line. Lime only ever means "detected" and violet only ever means "cited".

## Stack

- [Astro 7](https://astro.build) + TypeScript (strict), static output. Pages are prerendered. Only `/api/health` runs on demand on Vercel.
- `@astrojs/vercel` adapter, `@astrojs/sitemap`, `@astrojs/mdx`.
- [GSAP](https://gsap.com) from npm (ScrollTrigger, SplitText, MotionPathPlugin) for motion. Plain CSS tokens in `src/styles/global.css`.
- Self-hosted variable fonts via Fontsource: Hubot Sans (display, with the `wdth` axis), Familjen Grotesk (body) and JetBrains Mono (data). All three include Vietnamese subsets.
- One Cloudflare Worker: [`workers/portfo`](workers/portfo/README.md) — `portfo`: contact, page views, GitHub activity on **D1** + Resend + Cron Trigger, and the chat agent on Workers AI.
- ESLint (typescript-eslint + eslint-plugin-astro), Prettier (prettier-plugin-astro), `astro check`.
- GitHub Actions CI: lint, check, build, site unit tests, Playwright e2e, and the Worker's typecheck + tests.

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
    flow/FlowDiagram.astro  Reusable "How it works" flow: HTML node buttons, SVG edges, details panel / bottom sheet (scripts/flow.ts)
    case/CaseStudy.astro  Shared case-study template (skeleton: opener, overview, highlight, video slot, flow, deep dives, limits, next)
    OrgBadge.astro   "Enterprise · Talentnet" badge (from a work entry's org_badge)
  case-studies/    Pages on the template: <slug>/Page.astro + data.ts, registered in index.ts
  content/work/    Case studies (Markdown/MDX), one file per project
  data/            experience.json (CV entries for the timeline)
  lib/
    flow/            Flow data types, data checks and edge geometry
    case.ts          Case-study data contract
    flags.ts         Feature flags (PUBLIC_USE_MOCKS, PUBLIC_CASE_VIDEO)
    api.ts           PUBLIC_WORKER_URL helpers
    types.ts         Data contracts the Worker returns
    mocks/           Typed sample data (views, GitHub, contact, chat)
  pages/
    index.astro      Home
    work/[slug].astro Case-study pages
    api/health.ts    Tiny Vercel probe (no database)
  scripts/         Client code: features.ts, analytics.ts, activity.ts, chat/, …
  styles/          global.css, flow.css
docs/architecture.md
workers/
  portfo/          contact, views, GitHub, chat (D1 + Resend + Cron + Workers AI)
```

## Sample data and the mock flag

While `PUBLIC_USE_MOCKS` is `true` (the default), contact, views, GitHub activity and chat render **clearly labelled sample data** from `src/lib/mocks/*` and make no network calls. Every sample figure carries a †.

Set `PUBLIC_USE_MOCKS=false` and set `PUBLIC_WORKER_URL` to use the real Worker. If `PUBLIC_WORKER_URL` is empty while mocks are off, the UI shows honest empty/error states and does not throw.

Add `?dev` to the URL (with mocks on) to see the open content TODOs.

## Environment

Copy `.env.example` to `.env` for local work. **Never commit `.env` or any secret.** In production, set the same variables in the Vercel project settings. Only `PUBLIC_*` variables reach the browser.

| You want                             | Set                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Site with sample data                | nothing (defaults)                                                                                              |
| Live contact / views / GitHub / chat | `PUBLIC_USE_MOCKS=false`, `PUBLIC_WORKER_URL`. Secrets live on the Worker (`workers/portfo/.dev.vars.example`). |

There is **no** `DATABASE_URL`, `RESEND_*`, `GITHUB_TOKEN`, `CRON_SECRET`, or `VISITOR_HASH_SALT` on Vercel.

## Local Worker

```sh
cd workers/portfo && pnpm install && pnpm test
wrangler login
wrangler d1 create portfo   # put the database_id into wrangler.jsonc (both top level and env.production)
cp .dev.vars.example .dev.vars
wrangler d1 migrations apply portfo --local
pnpm dev
```

`wrangler.jsonc` carries the `database_id` of the `portfo` D1 database (an id, not a secret). On a fresh account, replace it in both blocks after `wrangler d1 create portfo`. Top-level `ALLOWED_ORIGINS` stays `http://localhost:4321` so local deploy/dev works; `env.production` still has `REPLACE_ME` until launch.

The live URL is whatever `wrangler deploy` prints for `portfo`. After the site points at `PUBLIC_WORKER_URL`, the old `portfo-chat` Worker can be deleted in the Cloudflare dashboard.

## Contact form

With mocks off and `PUBLIC_WORKER_URL` set, the form posts to `${PUBLIC_WORKER_URL}/contact`. Order: honeypot → validate → visitor hash → INSERT → Resend in the same request → respond. Success copy: "Thanks. I'll read it myself." If Resend fails, the row stays and the form gets `email_failed` (502). No captcha, no job queue, no LLM classification, no daily message rate limit.

Without JavaScript the form navigates cross-origin to the Worker, which returns a small HTML result page.

## Analytics

Cookie-free page views. Beacons use `fetch(..., { keepalive: true })` to `${PUBLIC_WORKER_URL}/view` (not `sendBeacon`; cross-origin JSON beacons are unreliable). One row per visitor + slug + Asia/Ho_Chi_Minh day. `GET /popular` powers "Most read this week" and the chat tool.

## GitHub sync

Cron Trigger on `portfo` (`17 */6 * * *`). Manual: `POST /cron/github-sync` with `Authorization: Bearer $CRON_SECRET`. The Activity section loads `${PUBLIC_WORKER_URL}/activity`.

## Chat

See [`workers/portfo/README.md`](workers/portfo/README.md). The browser posts to `${PUBLIC_WORKER_URL}/chat`. Tools `get_github_stats` and `get_popular_projects` read D1 in-process. Chat tools also read bundled `data/site.json`.

```sh
cd workers/portfo && pnpm install && pnpm test
```

After changing a case study, run `pnpm work` and `pnpm corpus` in `workers/portfo` (updates `data/work.json` and `data/site.json`). CI checks both are fresh.

## Deploy on Vercel

1. Import `maiphh/portfo` in Vercel. Framework preset Astro, install `pnpm install`, build `pnpm build`.
2. Node.js 22.x. Set `PUBLIC_USE_MOCKS`, `PUBLIC_WORKER_URL` (and optional `SITE_URL`).
3. Deploy the Worker with wrangler from `workers/portfo`.

## Workflow

- No direct pushes to `main` after the initial commit.
- Every change goes on a feature branch (`feat/…`, `fix/…`) and a pull request. CI must pass, and the Vercel preview link is the review surface.
- **Phu approves and merges PRs.** Agents never merge.

## Accessibility and motion

- WCAG 2.2 AA contrast, a skip link, and keyboard-complete controls.
- `prefers-reduced-motion`: every animation has a readable final state.
- Without JavaScript the whole page is readable.
- Below 1024px the chapters stack and leader lines are hidden. Below 960px the nav collapses into a menu.
