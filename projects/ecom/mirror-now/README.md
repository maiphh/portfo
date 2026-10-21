# Mirror Now

The first shop built on the [Ecom](../README.md) engine. It is the test implementation: a buyer storefront and a seller desk on top of `src/shop`. A later client shop should follow this shape, not fork the engine.

Repo: https://github.com/maiphh/ecom-mirror-now (private). `package.json` name is still `ecom`.

## What this shop adds

The engine matches the template: catalog, cart, pricing, stock, PayOS, the order state machine, Neon Auth, Cloudinary, Drizzle. The shop-specific surface is the Next.js app.

Buyer routes in `src/app/(store)`:

- `/` catalog
- `/product/[slug]`
- `/cart`
- `/orders` and `/orders/[id]`

Seller desk in `src/app/(desk)/desk`. `/admin` redirects there. Buyers do not see that layout.

- Products
- Orders, including one order by id
- Sales
- Events
- Codes

`src/storefront` holds the pieces those pages share: price formatting, photos, variants, setup, status. The theme is the variables at the top of `src/app/globals.css`. Changing the look means those variables plus the components in `src/storefront` and the pages under `src/app/(store)`. Those files import `@/shop/store` and `@/shop/auth`.

## Same rules as the template

A new payment provider does not edit `placeOrder` or `src/shop/orders/machine.ts`. A coupon is another discount in the list `priceCart` already takes. `CHECKOUT_METHODS` defaults to `payos`. `cod` is pay on delivery.

`npm run shop -- demo` runs a sale, an event, and a checkout in memory and prints the JSON the pages render. `npm run shop -- routes` lists paths. `npm run shop -- catalog` prints the live catalog when `DATABASE_URL` is set.

## Stack

Same as the template: Next.js 16.3.6, React 19, TypeScript, Tailwind 4, Drizzle, Neon Postgres, Neon Auth, PayOS, Cloudinary, Vitest.

Architecture: [architecture.md](architecture.md). Highlights: [highlights.md](highlights.md). The engine notes are one level up.

## Not in this pack

No public shop URL is set on the repo. No sales figures. Payment keys stay in `.env`.
