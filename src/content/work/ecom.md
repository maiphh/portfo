---
title: Ecom shop template
headline: One engine, many storefronts.
summary: A shop engine in TypeScript (catalog, cart, pricing, stock, payments and the order state machine) that a new storefront keeps as it is. The template came first; Mirror Now is the first shop built on it.
org: E-commerce template
meta: [E-commerce template, TypeScript]
order: 6
anchor: work-ecom
accent: { line: "#8cc8ff", tint: "#1d2a36" }
todo:
  - "Mirror Now: a public shop URL, if there is one, and any figures you want shown."
  - "An approved Mirror Now storefront screenshot (both repos are private, so the page uses labelled illustrations)."
---

Ecom is a shop template: one TypeScript engine, `src/shop`, holds the catalog, the cart, pricing, discounts, stock, payments and the order state machine. A storefront is a thin host that calls it. A test fails the suite if any file in the engine imports Next.js or React.

Mirror Now is the first shop built on the template: a buyer storefront and a seller desk on top of the same engine. The next client shop is meant to be a sibling of Mirror Now, not a rewrite of the engine.
