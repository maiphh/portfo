---
title: Document OCR pipeline
headline: Paperwork in, clean data out.
summary: A schema- and rule-driven document OCR pipeline on a vision-language model, built solo at Talentnet. Over 98% accurate, and it saves more than 90% of processing time.
org: Talentnet
meta: [Document OCR, Talentnet, Solo, In production]
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
  - { value: ">98%", label: accuracy, count: 98, prefix: ">", suffix: "%" }
  - { value: ">90%", label: processing time saved, count: 90, prefix: ">", suffix: "%" }
note: Illustrated with a made-up invoice. Talentnet's documents and code stay private.
---

I built this pipeline on my own at Talentnet, where I've worked as an AI Engineer Specialist since September 2025. It runs in production.

## How it works

A vision-language model reads each document as an image, so the layout is part of what it sees. A schema tells it which fields to look for, and every field it finds gets a box and a name.

A model alone will let some mistakes through, like a total that doesn't add up. A rule layer checks the extracted fields before anything moves on, and what comes out is structured data, ready for the next system.

## Results

- **Over 98%** accuracy.
- **More than 90%** of processing time saved.

## What I can't show

Talentnet's documents and code stay private. The illustration on the home page uses a made-up invoice, not a real document.
