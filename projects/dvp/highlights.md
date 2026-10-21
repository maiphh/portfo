# DVP highlights

Pieces worth showing on the case-study page. Each one is in the live tree under `/Users/phu.mai/Projects/dvp/dvp-backend`. Defaults below are implementation settings, not product results. The motion graphic's "4 min" and "6.4 h" are promo labels. Do not promote them to Result.

Calculation rules and validation rules are two translators. They share the sandbox and the LLM client. They do not share a prompt, a function prefix, a cache contract, or a retry budget (`docs/architecture/engine/README.md`).

## The prompt is a contract, not a paragraph

`HybridTranslator` asks the model for one function and a JSON envelope (`hybrid_engine/translator/prompts.py`, `PROMPT_VERSION = "v4"`).

The first-pass prompt is packed, not a dump of the workbook:

- The system contract names the signature, `calculate_<rule_id>(data, context)`, forbids imports, and lists the names that already exist in the sandbox (`datetime` is the class, `timedelta(...)` is not `datetime.timedelta`).
- Only sheets and earlier rules the formula actually cites go in. Uncited sheets collapse to one line. Uncited previous rules are omitted. A formula that cites nothing falls open to the full catalog.
- Nested examples keep two items, not the whole array.
- Few-shots stop at 3 examples or 6500 characters.
- Field hints distinguish a flat key, `Sheet::field`, and `Sheet::array[].inner`, and show the access pattern for each.

The rule text is fenced as payload, so a formula cannot rewrite the instructions. The prompt version is part of the cache key. Changing the contract without bumping the version would reuse old code. Bumping it without a contract change would retranslate every rule. Tests pin the string at `"v4"`.

## The repair loop is separate from the HTTP retry

One rule gets a semantic budget, default 5 attempts, inside a 180-second deadline that covers the model call and the validator (`docs/architecture/engine/translator.md`).

| Attempt | Prompt                  | Temperature   | Reasoning                                   |
| ------- | ----------------------- | ------------- | ------------------------------------------- |
| 1       | Full translation prompt | model default | runtime default                             |
| 2 … N−1 | Compact repair prompt   | 0.35          | one step higher (`low` → `medium` → `high`) |
| N       | Same repair prompt      | 0.35          | `high`                                      |

The repair prompt is not the first prompt again. It sends the contract recap, the rule text, the previous code, the error class, and a fix hint. Fields are relevance-ranked and capped at 80. Earlier rules are capped at 40. Few-shot examples are left out. The error class is one of `syntax`, `security`, `field`, `list_dict`, `runtime_type`, `other`.

If the budget runs out and time remains, one diagnostic call returns `message` and `suggestion`. That call is forbidden from emitting replacement code, so a last-ditch explanation cannot sneak a function through. Customer values in the validator error are replaced with `«privacy-redacted»` before they go back to the model. The generated source is not rewritten. Substituting the numbers taught the model fake placeholder bugs.

A failed rule does not stop the batch. It is stored as a stub that returns `None`. Dependents still translate and later see `None`. A cache hit is dry-run against the current fields. If the dry-run fails, the cached code is demoted and translated again. Failed stubs are never reused. Independent rules in one dependency level run in parallel, capped by the live LLM concurrency setting.

Dependencies come from the formula text. `[OtherRule]` waits on that rule, even when a sheet column has the same name. A phrase like "take Fullname from sheet X" does not become a fake cycle. Levels are a Kahn sort. A real cycle does not deadlock: the leftover rules each run as their own level.

Validation uses the same shape with its own prompt and a budget of 3. Rules are classified in one JSON call as `python` (per row), `batch_python` (once, return the violating indexes), or `duplicate` (a field hash, no code).

## HTTP retries do not hold a worker

`LLMService` is a second loop, under the semantic one (`app/services/llm/service.py`). Transport and bad JSON retry up to 3 times. Backoff is full jitter: sleep a random time between 0 and `min(10s, 1s × 2^(attempt−1))`, and never past the rule deadline. Non-retryable errors (auth, a bug in the client) raise immediately. The concurrency slot wraps only the HTTP call. The sleep happens outside it, so a retry does not occupy a model slot while it waits (`app/services/llm/concurrency.py`).

## Generated code is checked before it is stored

The model response must be a dict with a non-empty `code` string. Sanitize strips markdown fences and a trailing stray `}` the model often appends. An AST pass rejects imports and calls that do not belong in payroll code. A dry-run then executes the function on a sample record, under a deadline: an interval timer on the main thread, or a child process that can be killed. The stored function is what survived that, not the raw completion.

At process time a `TypeError` gets two execution retries before the rule is marked failed: an AST rewrite that auto-casts `+`, then a second call where every value in the data tree is a string (`None` becomes `""`). If it still fails, that field is `None` and the rest of the row continues. One bad rule does not drop the file.

## The sandbox is one policy for every engine

Calc translation, the dry-run validator, and validation execution share `sandbox.py` and `sandbox_runtime.py`. The security policy is not copied three times.

- Import lines are stripped. The AST rejects `import`. `__import__` is replaced with a function that allows a fixed set: `re`, `math`, `datetime`, `decimal`, `statistics`, `collections`, and the stdlib internals `datetime.strptime` needs (`_strptime`). Anything else raises `ImportError`.
- Builtins are a whitelist. `Exception` stays, because the prompts teach `try/except Exception` and the dry-run tests depend on it. `open` is absent. `setattr(...)` is rejected by the AST even though the name exists on the builtin dict. `getattr` is allowed.
- `datetime.date` and `datetime.timedelta` in the model's source are rewritten to the names the sandbox actually injects, with a different preset for calc and for validation, so a function that passed dry-run still means the same thing on the payroll run.
- `datetime.strptime` results are memoized (LRU, 100,000 entries). Compiled callables are memoized per runtime (LRU, 1,000). A month of rows does not recompile the rule.
- Lookup is strict for calc: the function must be named `calculate_<rule_id>`. A helper the model defined beside it is not silently used as the rule.

## What this shows

Natural language becomes a stored function only after a packed prompt, a repair loop that sees the actual error, a transport retry that does not block the pool, an AST and dry-run gate, and a sandbox whose allowed surface is explicit. The payroll run then treats a bad rule as one null field, not a failed file.
