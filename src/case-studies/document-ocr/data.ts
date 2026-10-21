/**
 * Document OCR case study. Sources: projects/ocr/{README,architecture,highlights}.md (portfo
 * main) and the OCR moodboard (portfo-design case-studies/moodboards/ocr.md, flow-example/).
 * Safe defaults until Phu confirms: no result figures, no "solo", no video.
 */
import type { CaseStudyData } from "~/lib/case";

export const ocr: CaseStudyData = {
  motion: "ocr",
  signatureCaption:
    "Illustration: a made-up page. Fields are boxed on the page and land in workbook cells. No client data.",
  overview: {
    problem:
      "Operators turn batches of PDFs and images into spreadsheet records by hand: read each page, type values into a workbook, check them again. Throughput is limited by page count and review time, and mistakes show up late.",
    solution:
      "A template-driven platform. An admin binds a workbook, a field schema, prompts and rules; a vision-language model reads each page into that schema, rules clean the fields, and operators correct them beside the source page and export Excel.",
    outcomeTodo:
      "The pack's go-live figures differ from the accuracy and time-saved figures the site showed before. Confirm which figures, if any, the page shows.",
  },
  highlight: {
    title: "A new document is configuration, not a new pipeline",
    caption:
      "Illustration built from projects/ocr/highlights.md. Field names are generic; no client data.",
  },
  video: {
    src: "/work/document-ocr/motion.mp4",
    caption: "Promo render. The figures on screen are illustration and appear only in this video.",
  },
  how: {
    summary:
      "Two apps on one PostgreSQL database and a local blob store. The database is also the work queue, so there is no Redis. Select any part to see what it does, its tech and the decision behind it.",
    stack: [
      { label: "Frontend", value: "Next.js", version: "16.2.10" },
      { label: "API", value: "FastAPI", version: "0.136.3" },
      { label: "Database and queue", value: "PostgreSQL", version: "15+" },
      { label: "Inference", value: "VLM, or OCR + LLM" },
      { label: "Sign-in", value: "Microsoft Entra ID, optional" },
      { label: "Files", value: "Local blob store" },
    ],
    flow: {
      cols: 6,
      label: "Parts of the system, in the order a page travels",
      keyLabel: "on the path a page takes",
      groups: { api: "FastAPI process" },
      // Labels fit two lines at the narrowest grid node (150px); details carry the rest.
      nodes: [
        {
          id: "browser",
          title: "Browser user",
          sub: "operators, admins",
          at: [1, 1],
          key: true,
          details: {
            does: "Operators stage files, start a run, correct fields beside the source page, and export Excel. Administrators define what to extract.",
            tech: ["Browser, signed in through the frontend"],
            why: "The browser flow is staged upload, then start. Start returns immediately and the UI polls the session, so a long batch never holds a request open.",
          },
        },
        {
          id: "web",
          title: "Next.js frontend",
          sub: "App Router · SWR",
          at: [1, 2],
          key: true,
          details: {
            does: "App Router pages for upload, review and export. Talks to the backend over REST.",
            tech: [
              "Next.js `16.2.10`",
              "React `19.2.3`, TypeScript `5.9.3`",
              "Tailwind CSS `4.3.3`",
              "SWR `2.4.1`",
              "@azure/msal-browser `4.30.0`",
            ],
            why: "REST is the main path. The older SSE extraction routes remain only for compatible clients; they are not the browser's start path.",
          },
        },
        {
          id: "entra",
          title: "Microsoft Entra ID",
          sub: "optional sign-in",
          at: [2, 2],
          details: {
            does: "Optional sign-in. After it, the backend issues the application's own JWT.",
            tech: [
              "Microsoft Entra ID / Graph",
              "MSAL in the browser",
              "PyJWT `2.13.0` on the backend",
            ],
            why: "One identity model for people and machines: an API key acts as the user it belongs to, so the same admission caps apply.",
          },
        },
        {
          id: "other",
          title: "Other application",
          sub: "POST /api/v1/ocr",
          at: [3, 1],
          details: {
            does: "Another system sends files and a template slug, and gets back structured fields and the filled workbook. No browser needed.",
            tech: [
              "`POST /api/v1/ocr`, Bearer API key or user JWT",
              "Key stored as a SHA-256 hash, shown once",
              "`GET /api/v1/ocr/{session_id}` for the result",
            ],
            why: "No second gateway. The call returns 202 as soon as the job is queued and never runs extraction inline. A webhook, if set, carries only the id and status; the caller pulls the body.",
          },
        },
        {
          id: "routers",
          title: "/api/v1 routers",
          sub: "one app, no gateway",
          at: [2, 3],
          key: true,
          group: "api",
          details: {
            does: "Own CORS, auth and every route: staged upload, start, review, export, and the machine routes.",
            tech: [
              "FastAPI `0.136.3`, Uvicorn `0.49.0`",
              "Pydantic `2.13.4`, pydantic-settings",
              "httpx `0.28.1`",
            ],
            why: "The machine API is a set of routes on the same app, in front of the same queue, so another application gets exactly what the UI gets.",
          },
        },
        {
          id: "domain",
          title: "Domain services",
          sub: "templates · sessions",
          at: [1, 4],
          key: true,
          group: "api",
          details: {
            does: "Stage uploads with admission checks (size, count, TTL, queue depth). On start, create the session and freeze the runtime settings, preprocess plan, schema, rules and prompts onto it.",
            tech: ["SQLAlchemy `2.0.50`, Alembic `1.18.4`", "asyncpg `0.31.0`"],
            why: "A new document type is configuration, not a new pipeline. Freezing the template on the session means a later edit cannot change a job already in flight.",
          },
        },
        {
          id: "worker",
          title: "Extraction worker",
          sub: "in-process · fair claim",
          at: [3, 4],
          key: true,
          group: "api",
          details: {
            does: "The durable, in-process worker: claims work units, renders pages, runs the active engine and the rules, writes review images and pages, and finishes the unit.",
            tech: [
              "In-process worker in the FastAPI app",
              "Render and extract as separate stages with a bounded ready queue",
              "Claim with `FOR UPDATE SKIP LOCKED`",
            ],
            why: "Claim picks the session with the least work running, then locks one unit, so one long PDF cannot take every slot. Operators set two numbers, render and extract concurrency (defaults 4 and 8); every other cap is derived from them so the limits cannot drift.",
          },
        },
        {
          id: "ai",
          title: "AI clients",
          sub: "engine at runtime",
          at: [2, 5],
          key: true,
          group: "api",
          details: {
            does: "Call the active engine. VLM (the boot default): page image to schema-shaped JSON. Hybrid: OCR to text, then an LLM maps it to the same schema.",
            tech: [
              "`EXTRACTION_ENGINE=vlm` at boot",
              "Hybrid can use native PDF text for single-page units when enabled",
            ],
            why: "Both engines return the same schema, so admins can switch the engine at runtime without touching templates.",
          },
        },
        {
          id: "pools",
          title: "Render and rule pools",
          sub: "pages · rules",
          at: [3, 5],
          key: true,
          group: "api",
          details: {
            does: "Render each source into normalized page images, split per page (default), per file, or in chunks. Then run compiled post-processing: copy, strip, regex pattern, or one restricted Python function.",
            tech: [
              "pypdfium2 `5.10.1`, pdf-inspector `1.18.0`",
              "Pillow `12.2.0`",
              "Separate process pool with a timeout for Python rules",
            ],
            why: "Rules stay in a sandbox. eval, exec, open, dynamic import and dunder access are rejected, a bad template cannot take down the API, and a rule never overwrites a field an operator corrected.",
          },
        },
        {
          id: "db",
          title: "PostgreSQL",
          sub: "record + work queue",
          at: [1, 6],
          key: true,
          details: {
            does: "The system of record (templates, sessions, pages) and the work queue.",
            tech: ["PostgreSQL `15+`", "work units claimed with `FOR UPDATE SKIP LOCKED`"],
            why: "No Redis. The database is the queue, so two pods cannot take the same page and there is one less service to run.",
          },
        },
        {
          id: "prov",
          title: "VLM, or OCR + LLM",
          sub: "outside the process",
          at: [2, 6],
          key: true,
          details: {
            does: "The model providers, outside the process: a vision-language model, or a Mistral-compatible OCR service plus an LLM mapper.",
            tech: ["Configurable providers"],
            why: "VLM, OCR and LLM concurrency equal extract concurrency, and render fills a buffer while extract runs, so the model is kept busy but never oversubscribed.",
          },
        },
        {
          id: "blob",
          title: "Local blob store",
          sub: "uploads · images",
          at: [3, 6],
          details: {
            does: "Holds staged uploads and the review image for each page.",
            tech: [
              "`IMAGE_STORE_TYPE=local`",
              "openpyxl `3.1.5` writes the export in the template's layout",
            ],
            why: "Local only today. An S3 option is reserved in config and not implemented, so the page does not claim it.",
          },
        },
      ],
      edges: [
        ["browser", "web"],
        ["web", "entra"],
        ["web", "routers"],
        ["other", "routers"],
        ["routers", "domain"],
        ["domain", "db"],
        ["routers", "worker"],
        ["worker", "db"],
        ["worker", "pools"],
        ["worker", "ai"],
        ["ai", "prov", "dotted"],
        ["worker", "blob"],
        ["domain", "blob"],
      ],
    },
  },
  dives: [
    {
      id: "queue",
      title: "Two knobs set every other cap",
      paragraphs: [
        "There is no Redis: PostgreSQL is the queue, and workers claim rows with `FOR UPDATE SKIP LOCKED`, so two pods cannot take the same page.",
        "Claim is two steps. First pick the session with the least work already running (then the oldest), skipping any over its in-flight cap; then lock one queued unit inside it. A 200-page PDF cannot fill every extract slot while everyone else waits.",
        "Render and extract are separate stages. Operators set render and extract concurrency (defaults 4 and 8); the ready buffer, pod cap, per-session cap and model concurrency are derived from those two, so the limits cannot drift apart.",
      ],
      shows: "Fairness and overlap are an explicit policy, not a pile of independent limits.",
      caption:
        "Illustration built from projects/ocr/highlights.md. Defaults are implementation settings, not results.",
    },
    {
      id: "rules",
      title: "Rules run in a sandbox and never undo a correction",
      paragraphs: [
        "Rule types are small on purpose: `copy_field`, `strip`, `pattern` (a regex capture) and `python`. Default rules run in order, then switch groups: a group watches one trigger field and the first matching case runs.",
        "A Python rule is one function, `transform(data, context)`. It returns a value, `None` to clear the field, or `SKIP` to leave it. Only `datetime`, `math`, `re` and `unicodedata` can be imported; `eval`, `exec`, `open`, dynamic import and dunder access are rejected.",
        "Rules run in a separate process pool with a timeout, so a bad template cannot take down the API. And a rule never overwrites a field an operator already corrected by hand.",
      ],
      shows:
        "Templates can carry real logic without becoming a way to break the service or the review.",
      caption:
        "Illustration of the documented rule contract (projects/ocr/highlights.md). Not code from the project.",
    },
    {
      id: "api",
      title: "Other applications use the same queue",
      paragraphs: [
        "`POST /api/v1/ocr` is a machine route on the same FastAPI process: no second service in front of it. A caller sends files and a template slug with an API key, hashed at rest and acting as the user it belongs to, so the same admission caps apply.",
        "The call returns 202 with a `result_url` as soon as the job is queued; an optional `wait_seconds` is capped at 60. Extraction never runs inside the request. When the session completes, `GET /api/v1/ocr/{id}` returns the post-processed fields and the filled workbook. A webhook carries only the id and status.",
      ],
      shows:
        "Integration is one route on the same queue, with the same frozen template, not a separate pipeline.",
      caption: "Illustration built from projects/ocr/architecture.md.",
    },
  ],
  limits: {
    notShown: [
      "Client documents, client field lists and extracted data.",
      "Source code, internal identifiers and secrets.",
      "Result figures, until they're confirmed for publication.",
    ],
    deprecated: [
      "Legacy SSE routes (`POST /extract/pdf`, `POST /extract/pdfs`) still run the older job path for compatible clients. They aren't the browser's start path.",
    ],
    reserved: [
      "S3 storage is reserved in config and not implemented: files live in a local blob store.",
      "Preprocessing is chosen when a run starts and frozen on the session. It isn't part of the portable template file yet.",
    ],
    docsLag: [
      "Hybrid native PDF text: the code can feed a PDF's own text to the hybrid mapper for single-page units (`EXTRACTION_NATIVE_PDF_TEXT_MODE`). The README and architecture spec don't describe it yet; follow the code.",
      "The specs still carry an old runtime stamp. Behaviour on this page was checked against the backend services, not that stamp.",
    ],
    stack: [
      {
        title: "Frontend",
        rows: [
          ["Framework", "Next.js `16.2.10` (App Router)"],
          ["UI", "React `19.2.3`, TypeScript `5.9.3`"],
          ["Styling", "Tailwind CSS `4.3.3`"],
          ["Data fetching", "SWR `2.4.1`"],
          ["Auth client", "@azure/msal-browser `4.30.0` (Microsoft Entra)"],
          ["Charts and tables", "recharts, @tanstack/react-table, @xyflow/react"],
        ],
      },
      {
        title: "Backend",
        rows: [
          ["Language", "Python ≥ 3.11"],
          ["API", "FastAPI `0.136.3`, Uvicorn `0.49.0`"],
          ["ORM and migrations", "SQLAlchemy `2.0.50`, Alembic `1.18.4`"],
          ["DB drivers", "asyncpg `0.31.0`, psycopg2-binary `2.9.12`"],
          ["Database", "PostgreSQL `15+`, also the durable work queue"],
          ["Job model", "In-process durable worker, `SKIP LOCKED` work units, no Redis"],
          ["Validation and settings", "Pydantic `2.13.4`, pydantic-settings"],
          ["HTTP and auth", "httpx `0.28.1`, PyJWT `2.13.0`"],
          [
            "PDF and images",
            "pypdfium2 `5.10.1`, pdf-inspector `1.18.0`, Pillow `12.2.0`, openpyxl `3.1.5`",
          ],
          ["Inference", "A configurable VLM provider, or OCR + LLM providers (hybrid)"],
          ["File storage", "Local blob store (`IMAGE_STORE_TYPE=local`)"],
        ],
      },
    ],
    stackSource: "Versions from the project's lockfiles at the time the pack was written.",
  },
};
