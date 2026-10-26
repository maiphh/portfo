/**
 * POET case study. Sources: projects/poet/{README,architecture,highlights}.md (portfo main), the
 * POET moodboard (portfo-design case-studies/moodboards/poet.md, flow-example/others/poet-flow.html)
 * and captures of the live site (maiphh.github.io/poet) taken with headless Chrome on the box:
 * every non-GET request to the donations Worker was blocked, the wall and the receipt status were
 * answered with sample data. No photos of children: the home photo is cropped out.
 */
import type { CaseStudyData } from "~/lib/case";

export const poet: CaseStudyData = {
  motion: "poet",
  hero_name: "POET",
  hero_mark: "youth charity",
  hero_tag: "donations · PayOS",
  hero_w: 3.14,
  overview: {
    problem:
      "POET, a youth charity, wanted a site that tells the story of its school visits and lets people give online, with a public wall of gifts. Static pages can't be trusted to decide that a payment happened, and a donor's name shouldn't go public without someone checking it.",
    solution:
      "Static pages on GitHub Pages for the story, and one Cloudflare Worker as the only process that talks to PayOS or the database. The Worker creates the payment, accepts PayOS's signed webhook, stores the gift in D1 and serves the wall, which shows a gift only after an admin publishes it.",
  },
  highlight: {
    title: "From a chosen gift to a thank-you letter",
    caption:
      "Captured from the live site with headless Chrome on 21 Oct 2026. The payment request was blocked; the receipt status and the donor details are sample data. The letter is drawn by the site's own card.js.",
  },
  how: {
    summary:
      "Two pieces: GitHub Pages serves the HTML, and the Worker is the only door to PayOS and D1. `config.js` is the one place the Worker's origin is set. Select any part to see what it does, its tech and the decision behind it.",
    stack: [
      { label: "Pages", value: "HTML, CSS, JS", version: "no framework" },
      { label: "Hosting", value: "GitHub Pages" },
      { label: "API", value: "Cloudflare Worker" },
      { label: "Database", value: "D1" },
      { label: "Checkout", value: "PayOS" },
    ],
    flow: {
      cols: 4,
      label: "Parts of the POET site: the gift's path across the top",
      keyLabel: "on the path that can mark a gift paid",
      nodes: [
        {
          id: "visitor",
          title: "Visitor",
          sub: "reads, gives",
          at: [1, 1],
          mAt: [1, 1],
          key: true,
          details: {
            does: "Reads the story, picks a gift on Ủng hộ, leaves a name and a message (or gives as Ẩn danh), and pays on PayOS.",
            tech: ["Any browser; Vietnamese copy"],
            why: "The donor's name and message stay in their own browser for the thank-you letter. The public status API never returns them.",
          },
        },
        {
          id: "pages",
          title: "GitHub Pages",
          sub: "static HTML",
          at: [1, 2],
          mAt: [2, 1],
          key: true,
          details: {
            does: "Home, the team, Đồng hành packages for companies, Ủng hộ and the admin page. Shared chrome is three web components: header, footer and lightbox.",
            tech: ["Static HTML, CSS and JavaScript, no framework", "Fonts: Baloo 2, Itim, Nunito"],
            why: "`config.js` sets the Worker's origin once; the donate, receipt and admin scripts all read it. The pages never decide that a gift is paid.",
          },
        },
        {
          id: "worker",
          title: "Worker poet-donations",
          sub: "the only door",
          at: [1, 3],
          mAt: [3, 1],
          key: true,
          details: {
            does: "Creates the gift and the PayOS link, receives the webhook, and serves the wall, the receipt status and the admin routes.",
            tech: [
              "Cloudflare Worker (Wrangler)",
              "`index.js` only routes; handlers per area",
              "CORS gate: `ALLOWED_ORIGIN` = the Pages origin",
            ],
            why: "The browser never marks a gift paid. Only the signed webhook (`POST /api/webhooks/payos`, signature checked in `payos.js`) does, and a late webhook is covered by a test.",
          },
        },
        {
          id: "d1",
          title: "D1",
          sub: "gifts and the wall",
          at: [1, 4],
          mAt: [4, 2],
          key: true,
          details: {
            does: "The `donations` table: order code, amount, display name, message, anonymous flag, status, PayOS ids, created and paid times. Admin users and sessions are separate tables.",
            tech: ["Cloudflare D1", "Index on `(status, paid_at)` for the wall"],
            why: "The wall reads published, paid gifts only. A name becomes “Ẩn danh” in one place, `mask.js`.",
          },
        },
        {
          id: "receipt",
          title: "Return page",
          sub: "receipt only",
          at: [2, 2],
          mAt: [5, 2],
          details: {
            does: "Where PayOS sends the browser back. It asks the Worker for the order's status and, when it's paid, shows the thank-you letter.",
            tech: ["`ung-ho/return.html`, `result.js`, `card.js`", "`GET /api/donations/:code`"],
            why: "The return and cancel URLs don't write paid. Someone can land here before the webhook arrives, so the page waits for the status instead of trusting the redirect.",
          },
        },
        {
          id: "payos",
          title: "PayOS",
          sub: "checkout and webhook",
          at: [2, 3],
          mAt: [4, 1],
          key: true,
          details: {
            does: "Hosts the checkout and calls the Worker's webhook when a payment lands.",
            tech: ["PayOS payment links", "Signed webhook"],
            why: "The browser never holds the PayOS keys; only the Worker does.",
          },
        },
        {
          id: "admin",
          title: "Admin page",
          sub: "publish or hide a gift",
          at: [2, 4],
          mAt: [2, 2],
          details: {
            does: "Signs in, then shows, publishes or hides a paid gift on the public wall.",
            tech: [
              "Username and password session",
              "A bearer token is still accepted as a fallback",
            ],
            why: "A paid gift doesn't appear on the wall by itself. Someone at POET publishes it first.",
          },
        },
      ],
      edges: [
        ["visitor", "pages"],
        ["pages", "worker"],
        ["worker", "d1"],
        ["worker", "payos"],
        ["payos", "receipt", "dashed"],
        ["receipt", "worker"],
        ["admin", "worker"],
      ],
    },
  },
  dives: [
    {
      id: "donate",
      title: "A gift is a real PayOS payment",
      paragraphs: [
        "The form asks the Worker to create a PayOS payment. The Worker stores the gift and returns the checkout link.",
        "PayOS tells the Worker when the payment lands. The signature is checked, and only then is the gift marked paid.",
        "Returning to the site does not mark it paid. That page is a receipt.",
      ],
      shows: "The donation is a real payment, recorded by the server.",
      caption: "PayOS checkout, then a signed notice that the gift was paid.",
    },
    {
      id: "wall",
      title: "A donor is shown on the site",
      paragraphs: [
        "The public wall shows the name, or “Ẩn danh” when the donor stays unnamed, with the message, the amount and when it was paid.",
        "A gift appears there after it is paid and an admin publishes it.",
      ],
      shows: "A real donation can be seen on the frontend.",
      caption:
        "The gift wall on the live site, captured on 21 Oct 2026 with two sample gifts. No real donors.",
    },
  ],
  limits: {
    notShown: [
      "No photos of children: the site has real trip photos, and this page leaves them out.",
      "Worker secrets, the D1 database id, the Cloudflare account id and admin credentials.",
      "Real donors: the wall and the letter here use sample data.",
    ],
    deprecated: [
      "The admin page still accepts a bearer token as a fallback to the username and password session.",
    ],
    reserved: [
      "Gift prices on the Ủng hộ page are examples until POET confirms them, so amounts in the screenshots are samples.",
      "Đồng hành, the corporate packages page, is a page of its own and not part of the donation flow.",
    ],
    docsLag: [
      "The pack's highlights.md is one line; the donation loop on this page is taken from its README and architecture notes.",
    ],
    stack: [
      {
        title: "Site",
        rows: [
          [
            "Pages",
            "Static HTML, CSS and JavaScript; web components `site-header`, `site-footer`, `site-lightbox`",
          ],
          ["Fonts", "Baloo 2, Itim, Nunito"],
          ["Hosting", "GitHub Pages from `/` on `master`"],
        ],
      },
      {
        title: "Donations",
        rows: [
          ["API", "Cloudflare Worker `poet-donations`, Wrangler, compatibility date 2026-01-01"],
          ["Database", "D1 `poet-donations`"],
          ["Checkout", "PayOS, signed webhook `/api/webhooks/payos`"],
        ],
      },
    ],
    stackSource: "From projects/poet/README.md and architecture.md.",
  },
};
