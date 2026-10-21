# DVP case-study brief

Factual notes for a portfolio case-study page. Do not invent metrics. Client payroll files stay out of this pack.

## Problem

DVP is for payroll operators (CICs) inside an HR outsourcing workflow. Each employer client has its own calculation and validation rules, and its own Excel or PDF layouts for a pay month.

The broken path is manual. Someone reads the client rules, rebuilds or checks the month’s sheets by hand, and catches mismatches after the fact. The backend operator README names the product as a Data Validation & Processing platform for automated salary calculation and payroll data validation (`/Users/phu.mai/Projects/dvp/dvp-backend/README.md`). The architecture index states the same shape: client config plus payroll files become calculated Excel output and validation violations (`/Users/phu.mai/Projects/dvp/dvp-backend/docs/architecture/README.md`).

Who uses it day to day is clearest from auth and frontend labels. Members are assigned to clients. The motion promo draws a CIC shell and a Process Data flow (`/Users/phu.mai/Projects/dvp/motion/render.py`). Exact headcount or hours saved for production is not stated as a measured result in the architecture docs. Do not treat the motion on-screen numbers as product metrics.

## Solution

Operators upload a config workbook (document types, fields, natural-language rules) plus sample inputs and templates. Init analyzes workbook layout and has an LLM translate those rules into sandboxed Python, then stores the compiled state on the client. Each later month, process reuses that state on new files. Preflight (`validate-input`) runs in the UI before process. Process can calculate, validate, or both, and returns output Excel plus a validation report. Config Workbench (wizard) is deprecated for new configuration work. New work uses init and update-rules.

## What the 15s video shows

Source timeline and render: `/Users/phu.mai/Projects/dvp/motion/timeline.py`, `/Users/phu.mai/Projects/dvp/motion/render.py`. `draw_frame` only plays intro, rules→AI→code, input→code→result, and the end card. Other scene helpers in `render.py` are not on this cut.

| Time        | Scene                 | On-screen labels / beats                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.0–2.4s    | Title slams           | `RULES.` with overline `01 · Plain language`. `AI.` with `02 · Turns them into code`. `PAY.` with `03 · Checked on every row`. Corner mark `DVP`. Tagline `Rules  to  code  to  pay`.                                                                                                                                                                                                                                                                                                                                                                                               |
| 2.4–7.05s   | How AI is used        | Overline `How AI is used`. Headline `Rules → AI → Code`. Card `01 · The rule` shows the plain-language prompt lines (`Net equals basic` / `+ OT + allowance` / `− deduct.`) and `Written in the config workbook, the way you would say it.` Card `02 · AI` shows `Translates` then `Reads the rule`, `Keeps the meaning`, `Writes the function`. Card `03` is a `net_pay.py` code block with an `AI` badge and the comment `# written by AI, meaning unchanged`.                                                                                                                    |
| 7.05–12.25s | The code on the files | Overline `The code on the files`. Headline `Input → Code → Result`. Input card (`01 · Input`, `timesheet.xlsx`) fills a sample row (employee id, name, basic, OT, allowance, deduct). Middle card reuses the generated function while a traveler chip moves the sample employee id across. Result card (`03 · Result`, `net_pay(…)`) reveals `Expected`, `On the sheet`, and `Off by`, then `Flagged before the file went out.` A stat strip under the cards counts up promotional labels `employees this cycle`, `violations caught`, and `4 min` / `against a 6.4 h manual pass`. |
| 12.25–15.0s | End card              | Talentnet mark, wordmark `DVP`, subtitle `Data Validation  &  Processing`, line `Rules to code with AI     ·     Code on every file`. Fade from 14.45s.                                                                                                                                                                                                                                                                                                                                                                                                                             |

The sample employee values and the time-comparison numbers are promo illustration only. They are not a filled Result section.

## Highlights

Full notes, with the defaults and the file paths: [highlights.md](highlights.md).

- **The prompt is a contract.** The model must return one function, `calculate_<rule_id>(data, context)`, and a JSON envelope. The prompt includes only the sheets and earlier rules the formula cites. The prompt version is part of the cache key, so a contract change cannot silently reuse old code.
- **Repair is its own loop.** Attempt 1 is the full prompt. Later attempts send a compact repair prompt: the previous code, an error class, and a ranked slice of fields. Temperature drops to 0.35 and reasoning steps up, ending at `high`. A last diagnostic call may explain the failure and is forbidden from emitting new code. One failed rule becomes a stub that returns `None`. The rest of the batch still translates.
- **HTTP retries are a second budget.** Transport failures retry up to 3 times with full-jitter backoff, and the sleep sits outside the model-concurrency slot so a waiting call does not hold a worker.
- **Code is checked, then sandboxed.** Fences are stripped, an AST pass rejects imports and unsafe calls, and a dry-run executes the function on a sample record under a deadline. Calc, the dry-run validator, and validation share one sandbox: a builtin whitelist, a fixed import set, and datetime names rewritten to the injected ones. At payroll time a bad rule nulls that field and the row continues.

## Result

_Placeholder. Phu will fill this in. Do not invent a metric._

## Sources

- `/Users/phu.mai/Projects/dvp/dvp-backend/docs/architecture/README.md`
- `/Users/phu.mai/Projects/dvp/dvp-backend/docs/architecture/pipeline/README.md`
- `/Users/phu.mai/Projects/dvp/dvp-backend/docs/architecture/engine/README.md`
- `/Users/phu.mai/Projects/dvp/dvp-backend/docs/architecture/wizard/README.md`
- `/Users/phu.mai/Projects/dvp/dvp-backend/docs/architecture/storage/README.md`
- `/Users/phu.mai/Projects/dvp/dvp-backend/docs/architecture/FLAGS.md`
- `/Users/phu.mai/Projects/dvp/dvp-backend/README.md`
- `/Users/phu.mai/Projects/dvp/dvp-backend/app/main.py`
- `/Users/phu.mai/Projects/dvp/dvp-backend/app/services/engine/factory.py`
- `/Users/phu.mai/Projects/dvp/dvp-backend/app/services/llm/service.py`
- `/Users/phu.mai/Projects/dvp/dvp-backend/requirements.txt`
- `/Users/phu.mai/Projects/dvp/dvp-backend/Dockerfile`
- `/Users/phu.mai/Projects/dvp/dvp-frontend/package.json`
- `/Users/phu.mai/Projects/dvp/dvp-frontend/AGENTS.md`
- `/Users/phu.mai/Projects/dvp/AGENTS.md`
- `/Users/phu.mai/Projects/dvp/motion/timeline.py`
- `/Users/phu.mai/Projects/dvp/motion/render.py`
- `/Users/phu.mai/Projects/dvp/motion/dvp_platform_motion.mp4`
