# Portfo

The portfolio of **Mai Gia Phu**, AI Engineer in Ho Chi Minh City.

The design idea is "the document under parse". The hero is my CV, scanned and boxed field by field into JSON. Two pinned, scroll-scrubbed chapters show the document OCR pipeline and the legal RAG assistant at work, and every drawn object is named by a tag or a leader line. Lime only ever means "detected" and violet only ever means "cited".

## Stack

- [Astro 7](https://astro.build) + TypeScript (strict), static output. Pages are prerendered. Only `/api/*` routes run on demand (`export const prerender = false`).
- `@astrojs/vercel` adapter, `@astrojs/sitemap`, `@astrojs/mdx`.
- [GSAP](https://gsap.com) from npm (ScrollTrigger, SplitText, MotionPathPlugin) for motion. Plain CSS tokens in `src/styles/global.css`.
- Self-hosted variable fonts via Fontsource: Hubot Sans (display, with the `wdth` axis), Familjen Grotesk (body) and JetBrains Mono (data). All three include Vietnamese subsets.
- Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/openai`), provider-swappable and not called yet.
- ESLint (typescript-eslint + eslint-plugin-astro), Prettier (prettier-plugin-astro), `astro check`.
- GitHub Actions CI on every push to `main` and every PR: install, lint, check, build.

The planned backend is described in [`docs/architecture.md`](docs/architecture.md): Neon Postgres + pgvector, a Postgres jobs table, the GitHub sync, Turnstile and rate limits.

## Scripts

Needs Node 22.22+ (see `.nvmrc`) and pnpm 10 (`corepack enable`).

| Command         | What it does                                                               |
| --------------- | -------------------------------------------------------------------------- |
| `pnpm install`  | Install dependencies                                                       |
| `pnpm dev`      | Dev server at http://localhost:4321                                        |
| `pnpm build`    | Production build (`.vercel/output`)                                        |
| `pnpm preview`  | Serve the built static output locally (no `/api` routes; use `vercel dev`) |
| `pnpm lint`     | ESLint + Prettier check                                                    |
| `pnpm lint:fix` | Auto-fix lint and formatting                                               |
| `pnpm check`    | `astro check` (types, content schemas, `.astro` files)                     |
| `pnpm verify`   | lint + check + build, the same as CI                                       |

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
    Ask.astro          "Ask about my work" (RAG chat UI)
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
    mocks/           Typed sample data (views, GitHub, Ask, contact)
    data.ts          Build-time data access: mocks today, APIs later
    ai/provider.ts   LLM + embedding model factory (Gemini default, OpenAI optional)
  pages/
    index.astro      Home
    work/[slug].astro Case-study pages
    404.astro
    api/health.ts    On-demand function (proves the /api wiring)
  scripts/         Client code: features.ts (works without motion), motion.ts (GSAP), home.ts (entry)
  styles/global.css Design tokens and all styles
docs/architecture.md  v1 backend plan
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

The backend features (Ask, GitHub activity, the contact queue and the most-read list) aren't built yet. While `PUBLIC_USE_MOCKS` is `true` (the default), they render **clearly labelled sample data** from `src/lib/mocks/*`. Every sample figure carries a † and a visible "sample" note, and the contact form says that nothing is sent.

Set `PUBLIC_USE_MOCKS=false` to see the honest empty states instead ("not connected yet"). Each real API will replace one mock module and return the shapes in `src/lib/types.ts`, in this order (see `docs/architecture.md`):

1. DB foundation (Neon, Drizzle schema, migrations, jobs + rate limits)
2. Contact form + worker + Resend
3. Analytics beacon + most-viewed
4. GitHub sync
5. RAG chat

Add `?dev` to the URL (with mocks on) to see the open content TODOs.

## Environment

Copy `.env.example` to `.env` for local work. **Never commit `.env` or any secret.** In production, set the variables in the Vercel project settings. Only `PUBLIC_*` variables reach the browser.

`DATABASE_URL`, `GEMINI_API_KEY` / `OPENAI_API_KEY` (`AI_PROVIDER=google|openai`), `GITHUB_TOKEN`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `CRON_SECRET`, `VISITOR_HASH_SALT`, plus optional `SITE_URL` and `PUBLIC_USE_MOCKS`. None are needed for the current build.

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

- WCAG 2.2 AA contrast, a skip link, keyboard-complete controls, and `/` to focus Ask.
- `prefers-reduced-motion`: every animation has a readable final state, and the reduced-motion path shows final states with no movement.
- Without JavaScript the whole page is readable: the hero, both chapters in their final state, a static SVG of the chart, and the sample answer.
- Below 1024px the chapters stack and leader lines are hidden. Below 960px the nav collapses into a menu.
