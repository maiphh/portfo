/**
 * OpenPortfo case study. Sources: projects/openportfo/{README,architecture,highlights}.md (portfo
 * main), the public repo github.com/maiphh/openportfo @786196b (backend/app/services/llm,
 * ports/chat_idempotency.py, frontend/package.json), and the OpenPortfo moodboard
 * (portfo-design case-studies/moodboards/openportfo.md, flow-example/others/openportfo-flow.html).
 * A personal project (Phu, 2026-10-22). Screens are local renders of the public repo with
 * in-memory fakes and sample holdings.
 */
import type { CaseStudyData } from "~/lib/case";

/** The agent's tools, from backend/app/services/llm/tools.py @786196b. */
export const AGENT_TOOLS: { name: string; changes?: boolean }[] = [
  { name: "search_assets" },
  { name: "get_quote" },
  { name: "list_holdings" },
  { name: "get_portfolio" },
  { name: "add_holding", changes: true },
  { name: "remove_holding", changes: true },
  { name: "add_watchlist", changes: true },
  { name: "remove_watchlist", changes: true },
  { name: "get_news" },
  { name: "analyze_asset" },
  { name: "analyze_portfolio" },
];

export const openportfo: CaseStudyData = {
  motion: "op",
  signatureCaption:
    "Illustration with sample holdings: two markets in one book, each priced from its own source when the book is refreshed.",
  credit: {
    lead: "UI credit: the frontend is cloned from the dashboard of",
    label: "OpenStock by Open Dev Society",
    href: "https://github.com/Open-Dev-Society/OpenStock",
    rest: ", an open-source market platform.",
  },
  overview: {
    problem:
      "Crypto and Vietnamese stocks usually live in different apps, with different price sources and currencies. Live price sockets are overkill for someone checking a book a few times a day, and calling a market API once per table row is slow and gets rate-limited.",
    solution:
      "One book for both markets, priced on demand: quotes are pulled when someone opens or refreshes it and once a day by a scheduled job, cached for minutes, and batched per refresh. An AI agent works the same book through tools that only see the signed-in user's data.",
  },
  highlight: {
    title: "An agent that changes the book only through tools",
    caption:
      "Local render of the public repo (@786196b) with in-memory fakes and a sample user; the tool list is from backend/app/services/llm/tools.py.",
  },
  how: {
    summary:
      "A Next.js client talks to FastAPI on Elastic Beanstalk through API Gateway. DynamoDB holds the records, S3 the price history (queried with Athena), and an EventBridge clock runs the daily jobs on Lambda. Select any part to see what it does, its tech and the decision behind it.",
    stack: [
      { label: "UI", value: "Next.js", version: "15.5" },
      { label: "API", value: "FastAPI", version: "Python 3.12" },
      { label: "Records", value: "DynamoDB" },
      { label: "History", value: "S3 + Athena" },
      { label: "Jobs", value: "EventBridge → Lambda" },
      { label: "Markets", value: "CoinGecko, vnstock" },
    ],
    flow: {
      cols: 5,
      label: "Parts of OpenPortfo: a request across the top, the daily clock below",
      keyLabel: "on a page load's path",
      groups: { job: "Daily clock" },
      nodes: [
        {
          id: "browser",
          title: "Next.js client",
          sub: "the book",
          at: [1, 1],
          key: true,
          details: {
            does: "Search, holdings, the watchlist, one asset's history and the chat panel. Prices are refreshed on purpose, never pushed.",
            tech: [
              "Next.js `15.5`, React `19.1`, client-rendered static export",
              "`lightweight-charts` 5, Tailwind 4, Radix",
              "Look cloned from OpenStock's dashboard",
            ],
            why: "The browser never calls CoinGecko or a broker. Every quote goes through the API, so caching and batching live in one place.",
          },
        },
        {
          id: "gw",
          title: "API Gateway",
          sub: "HTTP API, /api/*",
          at: [1, 2],
          key: true,
          details: {
            does: "Proxies `/api/*` to FastAPI.",
            tech: ["API Gateway HTTP API"],
            why: "REST goes through the gateway. A long-lived chat stream, if used, goes to Beanstalk directly rather than through the HTTP API.",
          },
        },
        {
          id: "api",
          title: "FastAPI",
          sub: "on Elastic Beanstalk",
          at: [1, 3],
          key: true,
          details: {
            does: "Users, holdings, the watchlist, valuation, news and the chat agent, behind one API.",
            tech: ["FastAPI, Pydantic, httpx, PyJWT", "Python `3.12`", "Elastic Beanstalk"],
            why: "`STORAGE_BACKEND=memory` and `AUTH_MODE=fake` run the same API off AWS for tests and a local demo; `aws` points it at DynamoDB and S3.",
          },
        },
        {
          id: "db",
          title: "DynamoDB",
          sub: "holdings, watchlist",
          at: [1, 4],
          key: true,
          details: {
            does: "Users, holdings, the watchlist, settings, news and the price cache.",
            tech: ["DynamoDB via boto3", "LocalStack stands in for local runs"],
            why: "A quote is cached for minutes (10 by default) so a table render isn't an API call per row.",
          },
        },
        {
          id: "mk",
          title: "CoinGecko and vnstock",
          sub: "pulled, cached",
          at: [1, 5],
          key: true,
          details: {
            does: "Crypto quotes and history from CoinGecko; Vietnamese stocks from `vnstock`, server-side only.",
            tech: ["CoinGecko API", "`vnstock` 4 (public broker endpoints)"],
            why: "One refresh batches the holdings. A failed call keeps the last good price, so the table doesn't go blank.",
          },
        },
        {
          id: "llm",
          title: "LLM provider",
          sub: "OpenAI-compatible",
          at: [2, 2],
          details: {
            does: "Answers the agent's completion calls and picks which tools to call.",
            tech: ["OpenAI-compatible chat completions", "A default model plus fallbacks"],
            why: "The model only proposes tool calls. It never sees a token or touches the database itself.",
          },
        },
        {
          id: "agent",
          title: "Chat agent",
          sub: "user-scoped tools",
          at: [2, 3],
          details: {
            does: "Runs complete → tools → complete until the model stops calling tools, then replies. Analysis questions go to a second, read-only analyst prompt.",
            tech: [
              "11 tools, 4 of them change data",
              "Up to 8 tool rounds",
              "Streams progress over SSE",
            ],
            why: "Tools get the already-resolved user, not a credential. A turn that may change data claims a per-user request id first, so a retried message can't add the same holding twice.",
          },
        },
        {
          id: "s3",
          title: "S3",
          sub: "history and snapshots",
          at: [2, 4],
          details: {
            does: "Price history and the daily snapshots of each book.",
            tech: ["S3"],
            why: "A history series is stored and reused instead of fetched for every chart.",
          },
        },
        {
          id: "athena",
          title: "Athena",
          sub: "queries on S3",
          at: [2, 5],
          details: {
            does: "Queries over the stored history.",
            tech: ["Athena over S3"],
            why: "History stays as files; queries run only when someone asks for them.",
          },
        },
        {
          id: "clock",
          title: "EventBridge",
          sub: "daily schedule",
          at: [3, 1],
          group: "job",
          details: {
            does: "Fires the daily jobs.",
            tech: ["EventBridge schedule"],
            why: "The only time anything runs without a person opening the book.",
          },
        },
        {
          id: "lambda",
          title: "Lambda",
          sub: "jobs only",
          at: [3, 2],
          group: "job",
          details: {
            does: "Runs the daily jobs: RSS news, a snapshot of each book, and an optional summary email.",
            tech: ["EventBridge → Lambda", "Writes to DynamoDB and S3"],
            why: "Lambda is only the clock. It isn't the request path for a page load: the book is served by FastAPI.",
          },
        },
        {
          id: "rss",
          title: "RSS",
          sub: "news",
          at: [3, 3],
          group: "job",
          details: {
            does: "News feeds, matched by keyword to the symbols on each book.",
            tech: ["feedparser"],
            why: "News is fetched once a day and stored, not per page view.",
          },
        },
        {
          id: "ses",
          title: "SES",
          sub: "optional email",
          at: [3, 4],
          group: "job",
          details: {
            does: "Sends the optional daily summary.",
            tech: ["Amazon SES"],
            why: "Opt-in: only people who asked for the daily email get one.",
          },
        },
      ],
      edges: [
        ["browser", "gw"],
        ["gw", "api"],
        ["api", "db"],
        ["api", "mk"],
        ["api", "s3"],
        ["s3", "athena"],
        ["api", "agent"],
        ["agent", "llm", "dotted"],
        ["clock", "lambda"],
        ["lambda", "rss"],
        ["lambda", "ses"],
        ["lambda", "s3"],
        ["rss", "db"],
      ],
    },
  },
  dives: [
    {
      id: "markets",
      title: "Two markets, one book, priced on demand",
      paragraphs: [
        "Crypto comes from CoinGecko and Vietnamese stocks from `vnstock`, both server-side. The book shows them side by side with value, profit and loss and allocation, and each currency's totals stay native when an exchange rate is missing.",
        "Nothing is streamed. Opening or refreshing the book pulls quotes in one batch; a quote is cached for minutes and a history series is stored and reused. A failed call keeps the last good price.",
      ],
      shows:
        "A tracker for a few checks a day doesn't need a price socket, and the API is the only thing that talks to a market.",
      caption:
        "Local renders of the public repo: the Vietnam stocks heatmap and one crypto asset (sample holdings; quotes as the API returned them at render time).",
    },
    {
      id: "fakes",
      title: "The same API runs on AWS or entirely in memory",
      paragraphs: [
        "Storage and auth are ports. `STORAGE_BACKEND=memory` and `AUTH_MODE=fake` keep the unit tests and a local demo off AWS, with a token such as `fake:alice` as the user. `STORAGE_BACKEND=aws` points the same API at DynamoDB and S3.",
        "LocalStack stands in for those two when a developer wants the AWS adapters without an account. Tests leave the AWS adapters off, so they stay on the fakes.",
      ],
      shows: "The screens on this page were rendered from the public repo without an AWS account.",
      caption: "Illustration of the two run modes, from projects/openportfo/architecture.md.",
    },
    {
      id: "clock",
      title: "Lambda is a clock, not the API",
      paragraphs: [
        "EventBridge fires once a day. Lambda then ingests RSS news, snapshots each book into S3 and, if someone asked for it, sends a summary email through SES.",
        "A page load never goes through Lambda: the book is served by FastAPI on Beanstalk. The daily snapshots are what the portfolio's history chart and daily profit-and-loss grid read.",
      ],
      shows:
        "Scheduled work and request work are split, so a cold start never sits in front of a person.",
      caption:
        "Local render of the portfolio page before the first snapshot job has run (sample user).",
    },
  ],
  limits: {
    notShown: [
      "No live deployment is linked: the AWS environment isn't kept running.",
      "Holdings, names and amounts in the screens are sample data from the in-memory backend.",
      "No AWS account ids, keys or model provider keys.",
    ],
    deprecated: [
      "`frontend-temp/` is a small Vite viewer used while the API was the thing under test; `frontend/` is the app.",
    ],
    reserved: [
      "The design puts the UI on S3 and CloudFront. CloudFront wasn't available in the AWS account it ran on, so the static export was served from Elastic Beanstalk.",
      "Exchange rates are an admin, on-demand call in the design, not a per-row fetch.",
    ],
    docsLag: [
      "`docs/architecture-design.md` still reads as the original plan; the stack here is checked against `backend/requirements.txt` and `frontend/package.json`.",
    ],
    stack: [
      {
        title: "App",
        rows: [
          [
            "UI",
            "Next.js `15.5.23`, React `19.1.0`, `lightweight-charts` `^5.2.1`, Tailwind 4, Radix",
          ],
          ["API", "FastAPI `>=0.115`, Uvicorn, Pydantic Settings, httpx, PyJWT, Python 3.12"],
          ["Markets", "CoinGecko; `vnstock` `>=4.0.5`; `feedparser` for RSS"],
          ["Agent", "OpenAI-compatible chat completions, tool registry, SSE progress"],
        ],
      },
      {
        title: "AWS",
        rows: [
          ["Edge", "API Gateway HTTP API, `/api/*` proxied to FastAPI"],
          ["Compute", "Elastic Beanstalk (API and the static export); Lambda for jobs"],
          ["Data", "DynamoDB; S3 queried with Athena"],
          ["Jobs and mail", "EventBridge schedule; SES (optional)"],
          ["Infra", "CloudFormation; LocalStack for local runs"],
        ],
      },
    ],
    stackSource:
      "From frontend/package.json and backend/requirements.txt in the public repo @786196b.",
  },
};
