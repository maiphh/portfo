# Document OCR case-study brief

Factual pack for the `/work` case-study page. Do not invent metrics. Demo numbers that appear in the motion graphic stay in the video section only.

## Problem

Operators who process batches of PDF and image documents into spreadsheet-ready records still do the work by hand. They read each page, type values into a workbook, and re-check fields. Throughput is limited by page count and review time. Mistakes show up late, when someone compares the export to the source.

The product is for that workflow. Administrators define what to extract. Operators stage files, run extraction, correct fields beside the source page, and export Excel.

## Solution

The platform is template-driven. An admin binds an Excel workbook, a field schema, prompts, and post-processing rules. At run time the system freezes that schema on the session so later template edits cannot change an in-flight job.

The current default inference path is direct VLM. Rendered page images go to a vision-language model that returns schema-shaped JSON. A hybrid path is also supported. A Mistral-compatible OCR service produces text, then an LLM maps that text to the same schema. Admins can switch the active engine at runtime. Compiled rules then turn raw model output into baseline structured fields for review and Excel export.

## What the 30s video shows

Packaged file: `motion.mp4` (30.000s, dark mode), copied from `ocr_platform_motion_30s_dark.mp4`.

Source: `motion/timeline.py` (`DUR = 30.0`) and `motion/render.py` (`--theme dark`). Warm Charcoal palette from the app's `.dark` tokens. Scene motion stays at the app's own speed; the extra time is dwell so each screen can be read.

Scene order and labels (30s constants):

1. **Title card (0–4s).** Slam words `PDF` → `PAGES` → `PIXELS` → `DATA.`, each with overline `01 · Input`, `02 · Render`, `03 · Recognize`, `04 · Structure`. Corner tagline: `PDF → structured data`.
2. **Process, upload (4–~8.6s).** Shell title `Document Extraction`. Prompt `How do you want to extract?` with `Use a template` selected. File zone shows `Upload files`, `Paste files`, and staged PDFs. Primary action `Start Extraction`.
3. **Process, review (~8.6–12s).** Progress reads `N / 24 pages`, then `Extraction complete`. A scan line crosses the source page. Bounding boxes light up. Structured field labels and values fill beside the page. Those demo identity, period, and amount fields are illustrative schema only, not a client field list.
4. **Pipeline (12–20s).** Overline `The pipeline`. Headline `From pixels to records.` Five nodes in order: `Upload` (Staged multi-file PDFs), `Preprocess` (Render, chunk, clean), `OCR · VLM` (Hybrid extraction), `LLM map` (Template schema), `Export` (Review to Excel). Footer bar `Processing batch` with percent.
5. **Dashboard (20–26s).** Shell title `Dashboard`. Stat cards `Pages processed`, `Extraction accuracy`, `Time saved` (motion demo figures only). Panels `Field Accuracy Board` and `Session Logs`. Rows flip from `Running` to `Completed`. Toast `Export ready` / `Session report downloaded` after the Export click.
6. **End card (26–30s).** Wordmark `OCR Platform` and line `Template-driven PDF extraction · Review · Excel export`.

## Highlights

Full notes, with the defaults and the file paths: [highlights.md](highlights.md).

- **A new document is configuration.** The template carries the schema, the prompts, the workbook binding, and the post-processing rules (`copy`, `strip`, regex, or one restricted Python function). A run freezes that package, plus a preprocess plan (split per page, per file, or by chunk; DPI and image filters), so a later edit cannot change an in-flight job. Preprocessing is chosen at start. It is not a field inside the portable template file yet.
- **Rules stay in a sandbox.** Python post-processing runs in a separate process pool with a timeout. `eval`, `exec`, `open`, and dunder access are rejected. A rule cannot overwrite a field an operator already corrected.
- **The queue overlaps render and extract, and it shares the model.** Postgres is the queue (`FOR UPDATE SKIP LOCKED`, no Redis). Claim picks the session with the least work running, then locks one unit, so one long PDF cannot take every slot. Render fills a bounded buffer while extract runs. Operators set two knobs, render concurrency and extract concurrency. The ready buffer, the pod cap, the per-session cap, and the VLM/OCR/LLM limits are derived from those two.
- **Other applications call the same API.** `POST /api/v1/ocr` takes files and a template slug, with an API key. The caller gets structured fields and the filled workbook. The browser is not required.

## Result

Two months after go-live:

- 7 templates in use.
- 8,000 pages processed.
- Average processing time about 800 ms per page.
- Accuracy 99.6%.
- About 300 hours saved.

## Sources

- `/Users/phu.mai/Projects/ocr/ocr/README.md`
- `/Users/phu.mai/Projects/ocr/ocr/docs/specs/application_architecture.md`
- `/Users/phu.mai/Projects/ocr/ocr/docs/specs/integrations.md`
- `/Users/phu.mai/Projects/ocr/ocr/docs/specs/system-overview.md`
- `/Users/phu.mai/Projects/ocr/ocr/motion/timeline.py`
- `/Users/phu.mai/Projects/ocr/ocr/motion/render.py`
- `/Users/phu.mai/Projects/ocr/ocr/motion/ocr_platform_motion_30s_dark.mp4`
- `/Users/phu.mai/Projects/ocr/ocr/frontend/package.json` and `package-lock.json` (stack versions)
- `/Users/phu.mai/Projects/ocr/ocr/backend/pyproject.toml` and `uv.lock` (stack versions)
- `/Users/phu.mai/Projects/ocr/ocr/backend/app/core/config.py` (default engine and storage)
- `/Users/phu.mai/Projects/ocr/ocr/backend/app/services/storage/factory.py` (S3 not implemented)
- `/Users/phu.mai/Projects/ocr/ocr/backend/app/services/extraction_jobs/` (work-unit claim and stages)
- `/Users/phu.mai/Projects/ocr/ocr/backend/app/services/extractor/` (VLM and hybrid extractors, post-processing)
