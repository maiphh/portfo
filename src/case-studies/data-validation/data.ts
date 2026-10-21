/**
 * DVP · payroll data validation case study. Sources: projects/dvp/{README,architecture,highlights}.md
 * (portfo main) and the DVP moodboard (portfo-design case-studies/moodboards/dvp.md,
 * flow-example/others/dvp-flow.html). No client rules or payroll data; no result figures (the
 * promo's on-screen numbers are not results); the promo video was not approved.
 */
import type { CaseStudyData } from "~/lib/case";

export const dvp: CaseStudyData = {
  motion: "dvp",
  signatureCaption:
    "Illustration: a made-up rule, its generated function and made-up rows. The flagged cell is where the sheet disagrees with the rule.",
  overview: {
    problem:
      "In HR outsourcing payroll, every employer client has its own calculation and validation rules and its own Excel or PDF layouts for a pay month. The manual path: someone reads the client's rules, rebuilds or checks the month's sheets by hand, and catches mismatches after the fact.",
    solution:
      "Operators upload a config workbook with the client's rules in plain language, plus sample inputs and templates. Init reads the workbook layout and has a model translate each rule into sandboxed Python, stored on the client. Every later month reuses that compiled state on new files: calculate, validate, or both, returning output Excel and a validation report.",
    outcomeTodo: "The pack leaves the result as a placeholder for Phu.",
  },
  highlight: {
    title: "The prompt is a contract",
    caption:
      "Illustration of the documented contract (projects/dvp/highlights.md). Body elided; no client rule.",
  },
  // Not approved for the page: renders only if the slug is added to flags.CASE_VIDEOS.
  video: {
    src: "/work/data-validation/motion.mp4",
    poster: "/work/data-validation/motion-poster.jpg",
    caption:
      "The platform's 15-second promo cut. Figures on screen are promo illustration, not results.",
    description:
      "Rules, AI, pay title words; a plain-language rule translated into a function; the function run on a sample timesheet row with the mismatch flagged; the end card.",
  },
  how: {
    summary:
      "A FastAPI backend and a Next.js app. A client holds its parsed workbook, sheet structure, compiled rules and templates. Init and update-rules teach that state; process runs it on a new month's files. Select any part to see what it does, its tech and the decision behind it.",
    stack: [
      { label: "API", value: "FastAPI", version: "/api/v2" },
      { label: "Frontend", value: "Next.js", version: "16.1.5" },
      { label: "Database", value: "PostgreSQL" },
      { label: "Rules", value: "Generated Python, sandboxed" },
      { label: "LLM", value: "On-prem, over HTTP" },
      { label: "Sign-in", value: "Microsoft Entra ID" },
    ],
    flow: {
      cols: 5,
      label: "Parts of the system: teaching a client above, a pay month below",
      keyLabel: "on a rule's path",
      groups: { init: "Init / update-rules", proc: "Process" },
      nodes: [
        {
          id: "parse",
          title: "parse-config",
          sub: "the client's workbook",
          at: [1, 1],
          key: true,
          group: "init",
          details: {
            does: "Reads the config workbook: document types, fields and the client's rules in plain language.",
            tech: ["openpyxl, pandas", "msoffcrypto-tool for protected files"],
            why: "Rules arrive the way an operator would say them, so a new client is a workbook, not a code change.",
          },
        },
        {
          id: "analyze",
          title: "extractor.analyze",
          sub: "read the layout",
          at: [1, 2],
          group: "init",
          details: {
            does: "Works out the layout of each input sheet or PDF so fields can be found again every month.",
            tech: ["openpyxl, pandas, pdfplumber", "On-prem LLM for layout reading"],
            why: "The model reads the shape once, at init. The monthly run reuses what it learned instead of asking again.",
          },
        },
        {
          id: "exi",
          title: "extractor.extract",
          sub: "sample rows",
          at: [1, 3],
          group: "init",
          details: {
            does: "Pulls sample records from the uploaded inputs.",
            tech: ["Same extractor as the monthly run"],
            why: "Translation and dry-run see real field names and shapes, so generated code is tested against the data it will meet.",
          },
        },
        {
          id: "translate",
          title: "engine.translate",
          sub: "rule → function",
          at: [1, 4],
          key: true,
          group: "init",
          details: {
            does: "Turns each plain-language rule into one Python function that the sandbox runs on every row.",
            tech: [
              "Signature `calculate_<rule_id>(data, context)`",
              "`PROMPT_VERSION` `v4`, part of the cache key",
              "Repair loop: 5 attempts in 180 s",
            ],
            why: "The prompt is a contract: it names the signature, forbids imports and lists what the sandbox provides. A rule that fails its budget becomes a stub returning `None`; the rest of the batch still translates.",
          },
        },
        {
          id: "persist",
          title: "Compiled client",
          sub: "persist + snapshot",
          at: [1, 5],
          key: true,
          group: "init",
          details: {
            does: "Stores the compiled rules, sheet structure and templates on the client, with a snapshot.",
            tech: ["PostgreSQL via SQLAlchemy 2.0, Alembic", "Files under a data directory"],
            why: "A month's run starts from this state. A run-scoped repair never changes it.",
          },
        },
        {
          id: "merge",
          title: "Merge inputs",
          sub: "one pay month",
          at: [2, 1],
          key: true,
          group: "proc",
          details: {
            does: "Combines the month's uploaded files into one run.",
            tech: ["`POST /api/v2/clients/{uid}/process`", "Spawn process pool, polled status"],
            why: "Process runs in a child process with a database-polled cancel, so a heavy month can't stall the API.",
          },
        },
        {
          id: "repair",
          title: "Run-scoped repair",
          sub: "fix, don't rewrite",
          at: [2, 2],
          group: "proc",
          details: {
            does: "Applies a repair overlay for this run when an input doesn't quite match what the client was taught.",
            tech: ["Overlay on the run, not the client"],
            why: "One odd file shouldn't change the deployed configuration for every later month.",
          },
        },
        {
          id: "exp",
          title: "extractor.extract",
          sub: "map the columns",
          at: [2, 3],
          key: true,
          group: "proc",
          details: {
            does: "Extracts the month's records using the layout learned at init.",
            tech: ["openpyxl, pandas, pdfplumber"],
            why: "No model call here: the layout is already known, so extraction is deterministic.",
          },
        },
        {
          id: "execute",
          title: "engine.execute",
          sub: "every row, every rule",
          at: [2, 4],
          key: true,
          group: "proc",
          details: {
            does: "Runs the stored functions on every row inside the sandbox, for calculation and for validation.",
            tech: ["One sandbox policy for every engine", "Compiled callables cached per runtime"],
            why: "A bad rule nulls that field and the row continues. One failing rule never drops the file.",
          },
        },
        {
          id: "tmpl",
          title: "Output and report",
          sub: "flags per cell",
          at: [2, 5],
          key: true,
          group: "proc",
          details: {
            does: "Maps results onto the client's template and writes the validation report, downloadable as a zip.",
            tech: ["openpyxl", "`GET …/runs/{id}/download-zip`"],
            why: "Operators get the file they would have built by hand, plus where it disagrees with the rules.",
          },
        },
        {
          id: "preflight",
          title: "Preflight",
          sub: "validate-input",
          at: [3, 1],
          details: {
            does: "A quick synchronous check of the month's files before process starts.",
            tech: ["`POST …/validate-input`, not a run"],
            why: "Catches a wrong file early in the UI. Process itself doesn't re-run it.",
          },
        },
        {
          id: "llm",
          title: "On-prem LLM",
          sub: "writes code, not verdicts",
          at: [3, 3],
          details: {
            does: "Reads layouts and translates rules at init. It never judges a payroll row.",
            tech: [
              "Chat completions over `httpx`",
              "3 transport retries, full-jitter backoff",
              "LangSmith tracing on the client",
            ],
            why: "The model's output is code that is checked, dry-run and stored. Rows are checked by that code, so a month's verdicts are repeatable.",
          },
        },
      ],
      edges: [
        ["parse", "analyze"],
        ["analyze", "exi"],
        ["exi", "translate"],
        ["translate", "persist"],
        ["preflight", "merge"],
        ["merge", "repair"],
        ["repair", "exp"],
        ["exp", "execute"],
        ["execute", "tmpl"],
        ["persist", "execute"],
        ["llm", "translate", "dotted"],
        ["llm", "analyze", "dotted"],
      ],
    },
  },
  dives: [
    {
      id: "ladder",
      title: "Repair is its own loop, with its own prompt",
      paragraphs: [
        "Each rule gets a semantic budget of 5 attempts inside a 180-second deadline. Attempt 1 uses the full prompt. Later attempts send a compact repair prompt instead: the previous code, the error class (syntax, security, field, list or dict, runtime type) and a relevance-ranked slice of fields. Temperature drops to 0.35 and reasoning steps up to high.",
        "If the budget runs out, one diagnostic call may explain the failure but is forbidden from emitting code. Customer values in the error are redacted before they go back to the model. The rule becomes a stub returning `None`; dependents still translate.",
        "Transport failures are a separate budget: 3 retries with full-jitter backoff, and the wait happens outside the model-concurrency slot, so a retry doesn't hold a worker.",
      ],
      shows: "A failed rule costs one field, not the client's whole configuration.",
      caption: "Defaults from projects/dvp/highlights.md: implementation settings, not results.",
    },
    {
      id: "gate",
      title: "Generated code is checked before it is stored",
      paragraphs: [
        "The response must be a dict with a non-empty `code` string. Markdown fences and a stray trailing brace are stripped, an AST pass rejects imports and calls that don't belong in payroll code, and a dry-run executes the function on a sample record under a deadline.",
        "What's stored is what survived that, not the raw completion. A cached function is dry-run again against the current fields before reuse. At payroll time a type error gets two more tries (auto-cast, then every value as text) before that field is set to `None`.",
      ],
      shows: "The model proposes; checks decide what runs on a pay month.",
      caption: "Illustration of the documented gate (projects/dvp/highlights.md).",
    },
    {
      id: "sandbox",
      title: "One sandbox policy for every engine",
      paragraphs: [
        "Calculation, the dry-run validator and validation share one sandbox. Imports are stripped and rejected by the AST; a replacement import allows a fixed set only. Builtins are a whitelist: `open` is absent and `setattr` is rejected.",
        "Date names in the model's code are rewritten to the ones the sandbox injects, so a function that passed dry-run means the same thing on the payroll run. The rule must be named `calculate_<rule_id>`: a helper defined beside it is never used as the rule.",
      ],
      shows: "The security surface is explicit and written once.",
      caption: "From projects/dvp/highlights.md.",
    },
  ],
  limits: {
    notShown: [
      "Client rules, payroll files, layouts and employee data.",
      "Screens of the live app, source code and internal identifiers.",
      "The promo video and its on-screen numbers, which are illustration, not results.",
      "A result figure, until one is confirmed for publication.",
    ],
    deprecated: [
      "The Config Workbench (wizard) is still mounted but deprecated; new configuration uses init and update-rules.",
      "The JSON rule engine was removed; the calculation engine is the hybrid translator only.",
    ],
    reserved: [],
    docsLag: [
      "The operator README still describes a dual JSON plus hybrid rule engine; the live factory is hybrid only.",
      "The same README lists LLM providers the client doesn't call; the client talks to the on-prem LLM over HTTP.",
      "The architecture index still draws the wizard as a peer of the live path.",
    ],
    stack: [
      {
        title: "Backend",
        rows: [
          ["Language", "Python `3.11`"],
          ["API", "FastAPI, Uvicorn; `/api/v2`, app version `2.0.0`"],
          ["Settings and validation", "Pydantic v2, pydantic-settings"],
          ["Database", "PostgreSQL, SQLAlchemy `>=2.0,<2.1`, psycopg2-binary, Alembic"],
          ["Jobs", "Thread pool for init and update-rules; spawn process pool for process"],
          ["LLM access", "On-prem chat completions over `httpx`, LangSmith tracing"],
          ["Rules runtime", "Generated Python, AST checks, sandboxed execution"],
          ["Workbooks and PDF", "openpyxl, pandas, pdfplumber, msoffcrypto-tool"],
          ["Auth", "Microsoft Entra in the app, backend JWT (PyJWT) with roles"],
          ["Logging", "loguru"],
        ],
      },
      {
        title: "Frontend",
        rows: [
          ["Framework", "Next.js `16.1.5` (App Router)"],
          ["UI", "React `19.2.3`, TypeScript 5, Tailwind CSS 4, Radix / shadcn"],
          ["Data", "SWR `^2.4`, next-intl `^4.14`"],
          ["Tables and charts", "@tanstack/react-table, @tanstack/react-virtual, recharts"],
          ["Auth", "@azure/msal-browser `^3.30`"],
        ],
      },
    ],
    stackSource:
      "Versions from the project's requirements, Dockerfile and package.json when the pack was written.",
  },
};
