---
title: Document OCR pipeline
headline: Paperwork in, clean data out.
summary: A template-driven document OCR platform I built solo at Talentnet. Admins define what to extract; a vision-language model reads each page, rules check the fields, and operators review and export Excel. Two months after go-live, 8,000 pages processed, with accuracy 99.6% and about 300 hours saved.
org: Talentnet
org_badge: Enterprise · Talentnet
accent: { line: "#d4f56b", tint: "#262b17" }
meta: [Document OCR, Solo, In production]
period: Sep 2025 – now
order: 1
anchor: work-ocr
confidential: true
steps:
  - title: Read the page
    body: A vision-language model reads each document as an image, layout and all.
  - title: Find every field
    body: A schema says what to look for. Each field the model finds gets a box and a name.
  - title: Check it against the rules
    body: Rules catch what a model alone would let through, like a total that doesn't add up.
  - title: Hand over clean data
    body: Structured output, ready for the next system.
facts:
  - { value: "8,000", label: pages processed, count: 8000 }
  - { value: "99.6%", label: accuracy, count: 99.6, decimals: 1, suffix: "%" }
  - { value: "About 300", label: hours saved, count: 300, prefix: "About " }
note: Illustrated with a made-up invoice. Talentnet's documents and code stay private.
---

I built this pipeline solo at Talentnet, where I've worked as an AI Engineer Specialist since September 2025. It runs in production.

## How it works

A vision-language model reads each document as an image, so the layout is part of what it sees. A schema tells it which fields to look for, and every field it finds gets a box and a name.

A model alone will let some mistakes through, like a total that doesn't add up. A rule layer checks the extracted fields before anything moves on, and what comes out is structured data, ready for the next system.

## Results

Two months after go-live:

- 7 templates in use.
- 8,000 pages processed.
- Average processing time about 800 ms per page.
- Accuracy 99.6%.
- About 300 hours saved.

## What I can't show

Talentnet's documents and code stay private. The illustration on the home page uses a made-up invoice, not a real document.
