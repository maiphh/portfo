/**
 * Ecom shop template case study, with Mirror Now as the first shop built on it. Sources:
 * projects/ecom/{README,architecture,highlights}.md and projects/ecom/mirror-now/*.md (portfo
 * main), the Ecom moodboard (portfo-design case-studies/moodboards/ecom.md,
 * flow-example/others/ecom-flow.html) and its recorded `npm run shop -- demo` output
 * (assets/ecom/shop-demo-output.json, an in-memory run with sample products). Both repos are
 * private: every artifact here is an illustration, no code links, no sales figures.
 */
import type { CaseStudyData } from "~/lib/case";

export const ecom: CaseStudyData = {
  motion: "ecom",
  signatureCaption:
    "Illustration: the engine stays put while storefronts change around it. Mirror Now is the first one built.",
  overview: {
    problem:
      "A small shop's code tends to tangle the money with the pages: a discount becomes a branch in checkout, a new payment provider edits the order logic, and the next client's store starts as a copy of the last one.",
    solution:
      "Put the shop in one TypeScript engine (catalog, cart, pricing, stock, payments and the order state machine) and make every storefront a thin host that calls it. A test fails the suite if the engine imports Next.js or React. A new discount, payment provider or storefront is added beside the engine, not inside checkout.",
  },
  highlight: {
    title: "The order state machine decides, not the page",
    caption:
      "Illustration of src/shop/orders/machine.ts as projects/ecom/architecture.md describes it. Private repo; no code shown.",
  },
  how: {
    summary:
      "Host pages (a storefront and a seller desk) call two adapters, `@/shop/store` and `@/shop/desk`. Behind them, `createShop` wires the order machine, pricing, the payment port and a storage gateway. Select any part to see what it does, its tech and the decision behind it.",
    stack: [
      { label: "Engine", value: "TypeScript", version: "no React" },
      { label: "Host", value: "Next.js", version: "16.3.6" },
      { label: "Database", value: "Postgres, Drizzle", version: "0.45" },
      { label: "Payments", value: "PayOS", version: "2.0.5" },
      { label: "Auth", value: "Neon Auth" },
      { label: "Tests", value: "Vitest", version: "5" },
    ],
    flow: {
      cols: 5,
      label: "Parts of the shop: the host on the left, the engine in the middle",
      keyLabel: "on an order's path",
      groups: { eng: "src/shop engine" },
      nodes: [
        {
          id: "pages",
          title: "Host pages",
          sub: "storefront and desk",
          at: [2, 1],
          key: true,
          details: {
            does: "The buyer storefront and the seller desk. In Mirror Now these are the `(store)` and `(desk)` route groups.",
            tech: [
              "Next.js `16.3.6`, React 19, Tailwind 4",
              "Theme = CSS variables + `src/storefront`",
            ],
            why: "Pages never import PayOS, Drizzle, Cloudinary or Neon Auth. Changing the look never adds a branch to `placeOrder`.",
          },
        },
        {
          id: "store",
          title: "@/shop/store and desk",
          sub: "host adapters",
          at: [2, 2],
          key: true,
          details: {
            does: "The only doors a page uses: one for buyers, one for the seller desk.",
            tech: [
              "`@/shop/store`, `@/shop/desk`",
              "`requireBuyer(host)` → `{ ok, value }` or `{ ok: false, reason }`",
            ],
            why: "The engine returns codes, not sentences. A host turns a code into a message with `describeError` or into a redirect with `withError`; `requireBuyer` doesn't know what a redirect looks like.",
          },
        },
        {
          id: "engine",
          title: "createShop",
          sub: "the engine",
          at: [2, 3],
          key: true,
          group: "eng",
          details: {
            does: "Wires the catalog, cart, pricing, stock, payments and orders into one shop.",
            tech: [
              "TypeScript, no `next`, `react` or `@/app` imports",
              "`src/shop/boundaries.test.ts` enforces it",
            ],
            why: "This is the part a new shop keeps. Two seams are still Next-shaped on purpose: Neon Auth's Next SDK and the PayOS return URL. They're the swap points for another framework.",
          },
        },
        {
          id: "orders",
          title: "orders/machine.ts",
          sub: "pure step function",
          at: [1, 3],
          key: true,
          group: "eng",
          details: {
            does: "Decides every order status change.",
            tech: ["`awaiting_payment` · `paid` · `collect_on_delivery` · `cancelled`"],
            why: "A payment notice is legal only from `awaiting_payment`, and only when the amount and order id match. A notice on a cancelled order is `unapplied`; anything else is `illegal`. A new payment provider never edits the machine.",
          },
        },
        {
          id: "price",
          title: "priceCart",
          sub: "discount producers",
          at: [1, 4],
          group: "eng",
          details: {
            does: "Prices a cart from a list of discount producers.",
            tech: [
              "`src/shop/pricing/applySaleOffs.ts`",
              "Sale-off is one producer; a coupon appends another",
            ],
            why: "A new price rule is a new producer in the list, not a branch inside checkout.",
          },
        },
        {
          id: "pay",
          title: "PaymentPort",
          sub: "charge · verify",
          at: [2, 4],
          key: true,
          group: "eng",
          details: {
            does: "The interface a payment provider implements: `methods`, `charge`, `verify`, optional `lookupPaid`.",
            tech: [
              "Registered in `src/shop/payments/registry.ts`",
              "`CHECKOUT_METHODS`: `payos` (default) and `cod`",
            ],
            why: "PayOS is offered only when its keys are set. Cash on delivery is its own status, not a fake card charge: fulfilling the order marks it paid and writes a receipt.",
          },
        },
        {
          id: "db",
          title: "Gateway",
          sub: "Postgres or in-memory",
          at: [3, 3],
          key: true,
          group: "eng",
          details: {
            does: "The storage port.",
            tech: [
              "Postgres via Drizzle `0.45` and `@neondatabase/serverless`",
              "`memoryGateway()` for tests and the demo",
            ],
            why: "The in-memory gateway is a second implementation of the port, not a mock, so the tests run the real engine.",
          },
        },
        {
          id: "payos",
          title: "PayOS webhook",
          sub: "/api/hooks/payos",
          at: [2, 5],
          key: true,
          details: {
            does: "PayOS reports a payment; the port verifies it and the machine decides what it means.",
            tech: ["`@payos/node` `2.0.5`", "`/api/hooks/<name>` per provider"],
            why: "The webhook can't mark anything paid by itself: the notice goes through `verify` and then the state machine's rules.",
          },
        },
        {
          id: "media",
          title: "Cloudinary",
          sub: "product images",
          at: [3, 5],
          details: {
            does: "Stores and serves product images.",
            tech: ["Cloudinary"],
            why: "Called through the engine; no page imports it.",
          },
        },
      ],
      edges: [
        ["pages", "store"],
        ["store", "engine"],
        ["engine", "orders"],
        ["engine", "price"],
        ["engine", "pay"],
        ["engine", "db"],
        ["engine", "media"],
        ["pay", "payos"],
      ],
    },
  },
  dives: [
    {
      id: "boundary",
      title: "The shop is not a Next.js app",
      paragraphs: [
        "`src/shop` has the catalog, the cart, the price, the stock, the payment and the order. A test walks every file under it and fails the suite if one imports `next`, `react` or `@/app`.",
        "Pages are a host. They call `@/shop/store` and `@/shop/desk` and never see Drizzle, PayOS or Cloudinary. The two files still tied to Next (Neon Auth's SDK and the PayOS return URL) are named as the swap points.",
      ],
      shows:
        "The engine a new client gets is the same code Mirror Now runs, not a fork of its pages.",
      caption:
        "Illustration of the boundary rule from projects/ecom/README.md. Private repo; paraphrased, not the test's code.",
    },
    {
      id: "extend",
      title: "A new discount or payment doesn't edit checkout",
      paragraphs: [
        "`priceCart` already takes a list of discount producers. A sale-off is one; a coupon is appended to the same list. Adding a price rule is a new producer, not a branch inside `placeOrder`.",
        "A payment provider implements `PaymentPort` and is registered with a webhook at `/api/hooks/<name>`. The state machine stays a pure step function, and cash on delivery is a status, not a fake charge.",
      ],
      shows:
        "The places that change for a new promotion or a new provider are listed, and checkout isn't one of them.",
      caption: "Illustration from projects/ecom/highlights.md.",
    },
    {
      id: "memory",
      title: "The test double is a second database",
      paragraphs: [
        "`memoryGateway()` implements the storage port. `npm test` and `npm run shop -- demo` run the real engine against it, with no Postgres and no payment keys.",
        "`scripts/verify-live.ts` is the same engine on a real database. It forces cash on delivery, so it moves no money, and deletes the rows it wrote.",
      ],
      shows:
        "A sale, a checkout and the stock an order takes are proven by running the engine, not by mocking it.",
      caption:
        "Real npm run shop -- demo output, condensed to one line per object (in memory, sample product; ids, dates and image URLs left out). Recorded for the moodboard on 21 Oct 2026.",
    },
  ],
  extra: {
    id: "mirror-now",
    rail: "Mirror Now",
    title: "Mirror Now: the first shop built on the template",
    paragraphs: [
      "Mirror Now is a buyer storefront and a seller desk on top of the engine. It adds the Next.js app around `src/shop`, not a new engine: catalog, cart, PayOS, the order machine, Neon Auth, Cloudinary and Drizzle are the template's.",
      "The look is the CSS variables at the top of `globals.css`, the shared pieces in `src/storefront` and the pages under `(store)`. A change to a colour, a product card or a desk page doesn't add a branch to `placeOrder`.",
      "The next client shop is meant to be a sibling of Mirror Now, not a rewrite of the engine. Today the engine's sources are copied into the Mirror Now repo rather than consumed as a package.",
    ],
    caption:
      "Illustration of Mirror Now's routes from projects/ecom/mirror-now/architecture.md. Private repo and no public shop URL, so no screenshots.",
  },
  limits: {
    notShown: [
      "No code links: the Ecom and Mirror Now repos are private.",
      "No public shop URL and no sales figures.",
      "Payment keys stay in `.env`.",
    ],
    deprecated: [
      "The engine is copied into the Mirror Now repo, not consumed as a published package.",
    ],
    reserved: [
      "A coupon is described as another producer for `priceCart`; this page doesn't claim one ships today.",
      "The next client shop is a plan: a sibling of Mirror Now on the same engine.",
    ],
    docsLag: [
      "Ecom's latest commit drops the small Next.js example host the pack still describes.",
      "Mirror Now's `package.json` name is still `ecom`.",
    ],
    stack: [
      {
        title: "Template (engine)",
        rows: [
          ["Shop", "TypeScript, no React inside `src/shop`"],
          ["Example host", "Next.js `16.3.6`, React 19"],
          [
            "Database",
            "Postgres via Drizzle (`drizzle-orm` `0.45`) and `@neondatabase/serverless`",
          ],
          ["Auth", "Neon Auth (`@neondatabase/auth`); `ADMIN_EMAILS` grants admin"],
          ["Payments", "PayOS (`@payos/node` `2.0.5`), webhook `/api/hooks/payos`"],
          ["Images", "Cloudinary"],
          ["Tests", "Vitest 5"],
        ],
      },
      {
        title: "Mirror Now",
        rows: [
          ["App", "Next.js `16.3.6`, React 19, TypeScript, Tailwind 4"],
          ["Engine", "The template's `src/shop`, copied in"],
          ["Services", "Neon Postgres, Neon Auth, PayOS, Cloudinary"],
        ],
      },
    ],
    stackSource: "From projects/ecom/README.md and projects/ecom/mirror-now/README.md.",
  },
};
