# OpenPortfo

One portfolio for crypto and Vietnamese stocks. Built as the RMIT Cloud Computing assessment: an on-demand tracker, not a trading app and not a live socket.

Repo: https://github.com/maiphh/openportfo (public).

The chart on the portfolio home page is sample data. It is not this app's book.

## What a person can do

- Register and sign in.
- Search a crypto asset or a Vietnamese stock and add it to a watchlist or to holdings (quantity and cost basis).
- See the book: value, profit and loss, allocation, filters.
- Open one asset and its price history.
- Read a news list matched to their symbols.
- Refresh quotes on purpose. Prices are not pushed.

A daily job can snapshot the book and, optionally, send a summary email.

## How the data is fetched

Quotes are pulled when someone opens or refreshes the book, and once a day by a scheduled job. The browser never calls CoinGecko or a Vietnamese broker.

- Crypto quotes and history come from CoinGecko.
- Vietnamese stock quotes and history come from `vnstock` (public broker endpoints, server-side only). A failed call keeps the last good price so the table does not go blank.
- News is RSS, matched by keyword to the person's symbols.
- Quotes are cached (about 5–15 minutes for a live price, longer for a history series) so a table render is not an API call per row.

## Stack

| Piece | Choice | Where it runs |
| --- | --- | --- |
| UI | Next.js 15, client-rendered. Charts are `lightweight-charts`. Tailwind 4, Radix | Static export. The design uses S3 and CloudFront. The lab build served the export from Elastic Beanstalk because CloudFront was blocked |
| API | FastAPI, Python 3.12, Pydantic, httpx, PyJWT | Elastic Beanstalk |
| Edge | API Gateway HTTP API, `/api/*` proxied to FastAPI | REST only. Chat SSE, if used, goes to Beanstalk directly |
| Jobs | EventBridge to Lambda | Daily RSS, portfolio snapshot, optional SES email. Not the user-facing API |
| Records | DynamoDB | Users, holdings, watchlist, settings, news, price cache |
| Files | S3, queried with Athena | Price history and daily snapshots |
| Local stand-in | Docker Compose LocalStack, or in-memory fakes (`AUTH_MODE=fake`, `STORAGE_BACKEND=memory`) | Tests stay on the fakes |

There are two frontends in the repo. `frontend/` is the Next.js app. `frontend-temp/` is a small Vite viewer used while the API was the thing under test.

Architecture: [architecture.md](architecture.md). Highlights: [highlights.md](highlights.md).

The design write-up in the repo is `docs/architecture-design.md`. It still talks like an assignment plan. The table above is the stack that write-up locked, checked against `backend/requirements.txt` and `frontend/package.json`.
