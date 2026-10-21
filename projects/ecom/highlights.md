# Ecom highlights

The template is the part that should not be rewritten for the next shop.

## The shop is not a Next.js app

`src/shop` has the catalog, the cart, the price, the stock, the payment, and the order. A test walks every file under that tree and fails if one imports `next`, `react`, or `@/app`. Pages are a host. They call `@/shop/store` and `@/shop/desk` and never see Drizzle, PayOS, or Cloudinary.

The engine returns codes, not sentences. The host decides whether a code becomes a message or a redirect. `requireBuyer` does not know how this framework redirects. It only says sign-in or forbidden.

## A new discount does not edit checkout

`priceCart` already takes a list of discount producers. A sale-off is one. A coupon is another appended to the list. Adding a price rule is a new producer, not a branch inside `placeOrder`.

## A new payment does not edit the state machine

`PaymentPort` is `methods`, `charge`, `verify`, and an optional `lookupPaid`. Register it and point `/api/hooks/<name>` at it. The machine stays a pure `step`. A payment notice is accepted only while the order is `awaiting_payment`, and only if the amount and the order id match. A notice for a cancelled order is rejected. Cash on delivery is a status, `collect_on_delivery`, not a fake card charge. Fulfill is what marks it paid.

## The test double is a second database

`memoryGateway()` implements the storage port. `npm test` and `npm run shop -- demo` run the real engine against it, with no Postgres and no payment keys. `verify-live.ts` is the same engine on a real database, forced to `cod`, and it deletes the rows it wrote.
