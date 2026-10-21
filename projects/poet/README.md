# Poet

A website for POET, a youth charity. Young people go to schoolhouses, spend time with the children, and keep the stories. The line on the site is tuổi trẻ, nhiệt huyết, nghệ thuật.

This is a client-facing site. The useful record is what it contains and how a donation becomes public, not a problem statement or a metric.

- Live: https://maiphh.github.io/poet/
- Repo: https://github.com/maiphh/poet (public, branch `master`, GitHub Pages from `/`)

## Pages

| Path | What a visitor gets |
| --- | --- |
| `/` | Home. Hero, who POET is, activities, memories. Photos are from real trips. |
| `team/` | The people who keep the group going. |
| `dong-hanh/` | Corporate partnership packages. Left as their own page. |
| `ung-ho/` | An individual donation. PayOS checkout, then a receipt. The return URL does not mark the gift paid. |
| `admin/` | Publish a paid gift onto the public wall. Username and password, with a bearer token still accepted as a fallback. |

Shared chrome is three web components: `site-header`, `site-footer`, `site-lightbox`. Copy and layout live in plain HTML and one stylesheet.

## Donations

The static pages never decide that a gift is paid.

1. The Ủng hộ form asks the Worker at `https://poet-donations.lucasmai.workers.dev` to create a PayOS payment. `config.js` is the only place that origin is set. The donate, result, and admin scripts read it.
2. PayOS calls the Worker webhook. The signature is checked in `worker/src/payos.js`. A late webhook is covered by `worker/test/webhook-late.test.mjs`.
3. The gift is stored in D1 (`poet-donations`). The public wall shows display name or “Ẩn danh”, the message, the amount, and the paid time, and only after an admin publishes it.
4. The PayOS return page is a receipt.

The Worker is `worker/` (Wrangler, compatibility date 2026-01-01). Routes are split across donations, gifts, pages, admin, and the webhook. `ALLOWED_ORIGIN` is `https://maiphh.github.io`.

## Stack

- Static HTML, CSS, and JavaScript. No framework. Fonts: Baloo 2, Itim, Nunito.
- GitHub Pages.
- Cloudflare Worker and D1 for payments and the gift wall.
- PayOS for checkout.

Architecture: [architecture.md](architecture.md). Highlights: [highlights.md](highlights.md).

## Leave out of a public write-up

Worker secrets, the D1 database id, the Cloudflare account id, and admin credentials. They are not in this pack.
