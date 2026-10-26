---
title: DVP · payroll data validation
headline: Every client, its own rules — turned into code.
summary: In HR outsourcing payroll, each client has distinct rules and data formats. AI converts client rules into code and reads varied formats dynamically, automating payroll generation and replacing the manual checker step to greatly reduce manual work.
org: Talentnet
org_badge: Enterprise · Talentnet
accent: { line: "#ff8f33", tint: "#33210f" }
meta: [Data validation, Payroll, In production]
period: Sep 2025 – now
order: 3
anchor: work-validation
confidential: true
steps:
  - title: Take the client's rules
    body: Each HR outsourcing client runs payroll by its own rules, in its own data formats.
  - title: Turn the rules into code
    body: AI converts each client's rules into code, so what a person once checked by hand now runs by itself.
  - title: Read the file, whatever it looks like
    body: The pipeline reads the input data dynamically instead of one fixed template.
  - title: Generate and check in one pass
    body: Payroll is generated and validated automatically — the manual checker step is replaced and manual work drops.
facts: []
todo:
  - Outcome metric (how much manual work it removed).
---

In HR outsourcing payroll, no two clients are alike: each one has distinct rules and a different data format. Keeping up means either hand-tailoring every client or leaving a person to check every run.

This project takes the other path. AI converts each client's rules into code, so the rules stop being tribal knowledge and start being executable. The pipeline reads the client's data formats dynamically instead of one fixed template, so a new client's files don't mean a rebuild.

Payroll generation is automated, and validation runs inside that pass — the separate manual checker step is replaced, which greatly reduces the manual work in payroll.

## What I can't show

Client rules, file formats and payroll data stay private. The illustration on the home page uses made-up values.
