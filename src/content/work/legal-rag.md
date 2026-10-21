---
title: Legal RAG assistant
headline: Answers that keep the citation.
summary: A legal RAG payroll assistant, built solo at Talentnet. Its Tag Chunker keeps the full Điều › Khoản › Điểm path on every chunk, so answers point to the correct document.
org: Talentnet
org_badge: Enterprise · Talentnet
accent: { line: "#b3a8ff", tint: "#26233d" }
meta: [Legal RAG, Solo, In production]
period: Sep 2025 – now
order: 2
anchor: work-rag
confidential: true
steps:
  - title: Keep the structure
    body: "Vietnamese legal texts nest: a [[Điều]] holds [[Khoản]], a [[Khoản]] holds [[Điểm]]."
  - title: Plain chunking drops it
    body: Cut the text into fixed-size pieces and a passage forgets where it came from.
  - title: The Tag Chunker carries it
    body: Every chunk keeps its full path, so nothing is cited from nowhere.
  - title: Answer with the exact reference
    body: Each answer points to the right document and to a reference a payroll team can cite.
note: Illustration with placeholder text, not real legal content.
todo:
  - Outcome metric. Only the qualitative outcome is stated for now.
---

I built this payroll assistant on my own at Talentnet. It runs in production and answers questions from Vietnamese legal documents.

## Why citations break

Vietnamese legal texts nest. A _Điều_ (article) holds _Khoản_ (clauses), and a _Khoản_ holds _Điểm_ (points). If you cut the text into fixed-size pieces, a passage forgets where it came from, and an answer built on it can't say which rule it is quoting.

## The Tag Chunker

My Tag Chunker keeps the full path, _Điều › Khoản › Điểm_, on every chunk, so nothing is cited from nowhere. Each answer points to the correct document and to a reference a payroll team can cite.

## What I can't show

Talentnet's documents and code stay private. The illustration on the home page uses placeholder text, not real legal content.
