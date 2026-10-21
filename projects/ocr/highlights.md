# OCR highlights

Pieces worth showing on the case-study page. Each one is in the live tree under `/Users/phu.mai/Projects/ocr/ocr`. Defaults below are implementation settings, not product results.

## A new document is configuration, not a new pipeline

An administrator binds an Excel workbook, a field schema, extraction prompts, and post-processing rules into one template. A run freezes that package onto the session, so a later edit to the template cannot change a job that is already in flight.

What the template carries (`docs/specs/template-settings.md`):

- The fields to extract, and where each one lands in the workbook.
- Prompts written as deterministic requirements: missing values stay null, the model is told not to guess, and conflicts say which label or page wins.
- Post-processing: ordered default rules, then switch groups. A group watches one trigger field. The first case whose value matches runs. One optional default case covers the rest. A rule never overwrites a field an operator has already corrected by hand.

Rule types are small on purpose: `copy_field`, `strip`, `pattern` (a regex capture), and `python`. A Python rule is one function, `transform(data, context)`. It may return a value, `None` to clear the field, or `SKIP` to leave it. Allowed imports are `datetime`, `math`, `re`, and `unicodedata`. `eval`, `exec`, `open`, dynamic import, and dunder access are rejected. The rule runs in a separate process pool with a timeout (`backend/app/services/extractor/python_rule_pool.py`), so a bad template cannot take down the API process.

Preprocessing is the other half of "this document is different," and it is not inside the portable template file yet. `ocr-template` version 1 has no preprocess block. The start request sends a `preprocess_config`. The backend compiles it, hashes it, and freezes the plan on `extraction_sessions.preprocess_plan`. The knobs are the split (`per_page`, `per_source`, or `page_chunks` with a chunk size) and the render (DPI 72–600, grayscale, max size, JPEG/PNG/WEBP, and optional filters such as rotate, sharpen, denoise). A new layout changes the plan for new sessions. It does not require a new service.

## The queue keeps the model busy and keeps one batch from owning it

There is no Redis. PostgreSQL is the queue. Workers claim rows with `FOR UPDATE SKIP LOCKED`, so two pods cannot take the same page (`backend/app/services/extraction_jobs/work_units.py`).

Claim is two steps, not "lock the oldest row":

1. Pick an eligible session. Least work already running wins, then the oldest queue. A session over its in-flight cap is skipped. A user over the admit cap does not start another batch while one is running.
2. Lock one queued unit inside that session.

That is the anti-starvation rule. A 200-page PDF cannot fill every extract slot while everyone else waits.

Render and extract are separate stages. Render concurrency defaults to 4, extract to 8. Operators set those two numbers. The rest is derived so the caps cannot drift (`docs/specs/design-pipeline-capacity.md`):

| Cap                           | Formula                                                                              | At the default extract concurrency of 8 |
| ----------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------- |
| Ready-to-extract buffer       | 2 × extract                                                                          | 16                                      |
| Units one pod may hold        | ready buffer + extract                                                               | 24                                      |
| Units one session may hold    | extract / 2, raised to a fair share of the pipeline when several sessions are active | 4, then shared                          |
| VLM, OCR, and LLM concurrency | equal to extract                                                                     | 8                                       |

Render fills the ready buffer while extract is busy, up to that buffer, so the vision model is not idle waiting for the next raster. When several sessions have work, the per-session ceiling is the pipeline depth divided across them, and never below the fairness floor. Semaphores change size only when they are idle, so a hot reload cannot corrupt the permit count. A wedged unit is reclaimed with `SKIP LOCKED` and a short lock timeout. The worker does not wait on a row another pod still holds.

## Other applications use the same pipeline

The UI is not the only client. `POST /api/v1/ocr` is a machine route on the same FastAPI process (`docs/specs/integrations.md`). There is no second service in front of it.

A caller sends files and a template slug with an API key. The key is hashed at rest, returned once, and runs as the user it belongs to, so the same per-user admission caps apply. The call returns as soon as the job is queued (**202**, `result_url`). An optional `wait_seconds` is capped at 60. Extraction does not run inside that HTTP request. The same worker, the same frozen template, and the same queue do the work.

When the session completes, `GET /api/v1/ocr/{id}` returns the post-processed fields and the filled workbook. A webhook carries only the id and the status. The other application pulls the body. `correlation_id` lets that application match the session to its own record. `GET /api/v1/ocr/templates` lists the slugs it is allowed to ask for. A call without a template is rejected. The no-template path stays in the browser.

## What this shows

The adaptation surface is data: schema, prompts, rules, and a frozen preprocess plan. The throughput surface is a queue with an explicit fairness and overlap policy, derived from two knobs instead of a pile of independent limits. The integration surface is one route on that same queue, so another application gets the structured record and the workbook without a separate pipeline.
