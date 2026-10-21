---
title: Document OCR pipeline
headline: Paperwork in, clean data out.
summary: A template-driven document OCR platform at Talentnet. Admins define what to extract; a vision-language model reads each page, rules check the fields, and operators review and export Excel.
org: Talentnet
org_badge: Enterprise · Talentnet
accent: { line: "#d4f56b", tint: "#262b17" }
meta: [Document OCR, In production]
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
note: Illustrated with a made-up invoice. Talentnet's documents and code stay private.
todo:
  - "Result figures: the project pack's go-live numbers differ from the accuracy and time-saved figures the site showed before. Confirm which figures, if any, the page shows."
  - "Confirm whether the page says the pipeline was built solo (the pack doesn't say so)."
  - "motion.mp4 is Talentnet-branded: confirm it can be embedded (the video slot is off until then)."
---

I work at Talentnet as an AI Engineer Specialist (since September 2025). This pipeline runs in production there.

## How it works

A vision-language model reads each document as an image, so the layout is part of what it sees. A schema tells it which fields to look for, and every field it finds gets a box and a name.

A model alone will let some mistakes through, like a total that doesn't add up. A rule layer checks the extracted fields before anything moves on, and what comes out is structured data, ready for the next system.

## What I can't show

Talentnet's documents and code stay private. The illustration on the home page uses a made-up invoice, not a real document.
