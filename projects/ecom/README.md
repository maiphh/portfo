# Ecom

The shop template. A later client shop is another implementation beside Mirror Now. It keeps this engine and replaces the storefront.

Repo: https://github.com/maiphh/ecom (private). There is no separate storefront to copy. `src/app` is a small Next.js example that proves a page can call the engine.

## What the template owns

`src/shop` is the product. Catalog, cart, pricing, discounts, stock, payments, and the order state machine live there. No file under `src/shop` may import `next`, `react`, or `@/app`. `src/shop/boundaries.test.ts` fails the suite if one does.

Two seams are still Next-shaped, and they are the pieces to swap for another framework:

- `src/shop/auth/neon.ts` uses Neon Auth's Next SDK.
- `src/shop/payments/payos.ts` builds the return URL from `NEXT_PUBLIC_APP_URL`.

Pages reach the shop through `@/shop/store` and `@/shop/desk`. UI code does not import PayOS, Drizzle, Cloudinary, or Neon Auth. The engine returns error codes. A host turns a code into a sentence with `describeError`, or into a redirect with `withError`. `requireBuyer(host)` returns `{ ok: true, value }` or `{ ok: false, reason }`. It does not know what a redirect looks like. `src/app/auth/host.ts` is the Next.js version of that host.

## How a new shop inherits

Keep `src/shop`. Build the buyer UI and the seller desk in the app. Mirror Now is the first time that was done. The next client is a sibling of Mirror Now, not a rewrite of the engine.

A new payment provider is `src/shop/payments/<name>.ts` with `methods`, `charge`, `verify`, and optional `lookupPaid`, registered in `registry.ts`. The webhook is `/api/hooks/<name>`. `placeOrder` and `src/shop/orders/machine.ts` stay as they are.

A new discount is another producer in the list `priceCart` already takes (`src/shop/pricing/applySaleOffs.ts`). A coupon appends to that list. Checkout is not edited.

`CHECKOUT_METHODS` chooses the buttons. Default is `payos`. `cod` places an order with no charge. PayOS is offered only when its keys are set.

## Proof without a database

`memoryGateway()` is an in-memory storage port, not a mock. `npm test` runs the engine against it. `npm run shop -- demo` runs a sale end to end in memory. `src/shop/examples/mini-store.ts` is the same engine as one executable file.

`scripts/verify-live.ts` exercises a real Postgres database and deletes what it creates. It forces `CHECKOUT_METHODS=cod`, so it does not move money.

## Stack

| Piece | Choice |
| --- | --- |
| Shop | TypeScript, no React inside `src/shop` |
| Example host | Next.js 16.3.6, React 19 |
| Database | Postgres via Drizzle (`drizzle-orm` 0.45) and `@neondatabase/serverless` |
| Auth | Neon Auth (`@neondatabase/auth`). `ADMIN_EMAILS` grants the admin role |
| Payments | PayOS (`@payos/node` 2.0.5). Webhook `/api/hooks/payos` |
| Images | Cloudinary |
| Tests | Vitest 5 |

`npm test` needs no credentials. A real database needs `DATABASE_URL`, then `npm run db:push` on an empty database or `npm run db:migrate` when tables already exist.

Architecture: [architecture.md](architecture.md). Highlights: [highlights.md](highlights.md).

## Implementations

| Shop | Role | Pack |
| --- | --- | --- |
| Mirror Now | First test storefront and seller desk on this engine | [mirror-now/README.md](mirror-now/README.md) |

Today the shop sources are copied into the Mirror Now repo. They are not consumed as a published package. The relationship to keep is still this one: one engine, many storefronts.
