---
title: OpenPortfo
headline: Crypto and Vietnamese stocks, side by side.
summary: One portfolio for crypto and Vietnamese stocks, on AWS. Quotes are pulled when someone opens or refreshes the book, and an AI agent can search, add and remove holdings for the signed-in user.
org: OpenPortfo
meta: [Portfolio tracker, AWS, Public repo]
order: 5
anchor: work-openportfo
accent: { line: "#4fd8c4", tint: "#173230" }
note: The chart on the home page is sample data.
links:
  - { label: Repository, href: https://github.com/maiphh/openportfo }
todo:
  - "Framing: the page stays neutral. Say whether to present it as a personal project or as the RMIT Cloud Computing assessment it was built for."
  - "AI agent: the model the demo runs on, and any usage figures you want shown."
  - "A live URL, if one is kept up."
---

OpenPortfo keeps crypto and Vietnamese stocks in one book: value, profit and loss, allocation, a watchlist and matched news. It is an on-demand tracker, not a trading app and not a live price socket.

Quotes are pulled when someone opens or refreshes the book, and once a day by a scheduled job. The browser never calls CoinGecko or a Vietnamese broker. An AI agent in the app can search assets, add or remove holdings and explain the book, using tools scoped to the signed-in user.

The chart on the home page is an illustration with sample data, not a real portfolio.
