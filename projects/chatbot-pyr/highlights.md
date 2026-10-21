# Legal RAG highlights

Pieces worth showing on the case-study page. Each one is in `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend`. Defaults are implementation settings, not product results.

The portfolio name for this work is the Tag Chunker. In the live tree that is two labelers, not one function. Both exist so a retrieved passage still knows where it sat in the document.

## The HTML chunker trusts the page's own anchors

`chunk_html` (`app/services/chunk.py`) is what a thuvienphapluat link goes through.

It does not split on the string "Điều". A paragraph that mentions another article would become a false boundary. It walks `<p>` tags and starts a new chunk only when the paragraph contains `<a name="dieu_N">`. The title is the anchor text, with newlines collapsed. Elements are kept as HTML until the next article starts, and only then turned into text, so a title that spans lines is still one heading.

The stored chunk is:

```text
[Số: 336/2025/NĐ-CP > Điều 1. Phạm vi điều chỉnh]
<body of that article>
```

The document number is taken from the "Số:" or "Luật số:" line once per page and reused on every article. This path stops at Điều. It does not emit Khoản or Điểm as their own chunks. Those stay inside the article body.

`crawl_tvpl_api` reads the law id from the trailing digits of the `.aspx` URL and calls the site's document-detail API. Metadata parsed from that response (not all of it is written onto the chunk) includes the code, title, organ, signer, dates, and effect status. The chunker only receives the HTML. `upload_link` does not fall back to the `div.content1` scrape. That scrape lives on `crawl()`, which the request path never calls.

## The PDF path rebuilds the hierarchy the anchors do not have

A scanned or digital PDF has no `dieu_N` anchor. `process_pdf` renders each page and sends it to the vision model one page at a time (`Semaphore(1)`), then concatenates in page order.

`ocr_prompt` is the contract for that read:

- `## Điều X` only when the page literally says "Điều" plus a number. A bare "4." must not become "Điều 4".
- `###` for a Khoản, `####` for a Điểm (`a)`, `b)`, `c)`).
- A new page that starts at "2." is a continuation of the previous article, not a new one.
- A running header that looks like the next Điều, followed by the rest of the previous Khoản, loses to the continuation.
- The model is told not to add, drop, or reword.

`chunk_with_llm` then labels that markdown. It is a pipeline, not one prompt:

1. **Coarse split.** `RecursiveCharacterTextSplitter`, 4000 characters, 200 overlap. Separators are the markdown headers and the words `Điều`, `Phụ lục`, `Chương` before any ordinary newline. A legal boundary is preferred to a mid-sentence cut.
2. **Regex repair, before the model sees the block.** `verify_and_repair` merges a chunk that ends on a bare "Điều N" or "Phụ lục" into the body that follows. It merges a buffer that does not end on `.` `;` `!` or `?` when the next chunk is not a new numbered item, and it always merges when the cut is a comma. A buffer shorter than 50 characters that is only "Khoản 1" or "Điểm a" is merged. The model is not asked to fix a split the regex can see.
3. **Label, with memory of the previous block.** Each block goes to `chunk_prompt_dispatch` with `last_level_hint`. If the block opens with "3." or "c)" and no new header, the prompt says it continues that level. The model must return JSON only, copy the source verbatim, and leave `doc_id` and `title` null when this block does not contain them. It must not invent a Điều for a công văn. Bullets that merely cite "tại Điều 1" stay under the current topic. "Nơi nhận" and the signature block are one chunk.
4. **State carried across blocks.** The first good document id and the longest non-truncated title are locked and reused, so a middle page does not wipe the citation header. The level string is cleaned of markdown markers. The stored line is `[doc id | title | level]` plus the verbatim body. `level` is the path the model was told to keep, such as `Điều 1. Phạm vi điều chỉnh` or `Phụ lục > … > 1. Vùng I`.
5. **JSON retries, then a different algorithm.** Up to 3 attempts per block. The parser strips fences and, if the model appends junk after the object, keeps only the brace-matched JSON. After 3 failures that block is split with `semantic_chunk` (Vietnamese bi-encoder `bkai-foundation-models/vietnamese-bi-encoder`, break where consecutive-sentence similarity drops) instead of being discarded. Any other exception keeps the raw block.
6. **Post-process.** `post_process_chunks` drops a chunk that is an 0.8 sequence-match of the previous one. Inside the same Điều or phụ lục prefix, a chunk that is a subset of the previous one is dropped, and the longer one wins.

Garbage lines are dropped after labeling: a chunk that is only "1.", a chunk that is only the header "Điều 5.", a tiny "Lưu:" line. A short capitalized name inside the signature section is kept.

## What is not the live chunker

`splitter.chunk_recursive` is the deterministic version of the same idea. It detects Điều versus Roman-numeral công văn versus numbered sections, and it would write `[source | Điều 5 | Khoản 2]` when a chunk holds exactly one Khoản. No caller references it. Do not describe it as what production runs.

`semantic_chunk` is the fallback and the `GENERAL` branch inside `chunk()`. The upload path for a general file does not use that branch. It calls the hybrid legal chunker.

## Retrieval is allowed to say nothing

`query_async` embeds the question with `qwen3-embed-8b` on the on-prem LLM and orders `document_chunks` by pgvector cosine distance. There is no keyword index and no hybrid fusion in this process. The `AI/search` app has hybrid search and a reranker. It is not this service.

Rerank, when the config turns it on, builds `(query, chunk)` pairs and runs a cross-encoder in a worker thread so the event loop stays free. Scores are passed through a sigmoid. Anything under the threshold is dropped, then the list is cut to `top_k_rerank`. Default threshold is 0.7, default keep is 2, default model is `BAAI/bge-reranker-v2-m3`, and the default switch is off. Device choice is CUDA, then Apple MPS, then CPU. The model object is cached by name.

The answer prompt (`DEFAULT_SYSTEM_PROMPT`) is a payroll consultant for Talentnet. It may use only the retrieved context. The required shape is a citation line (`Theo [số tài liệu, điều, khoản]`), a quote, then the answer. If the retrieval is empty, `chat()` never calls the model. It stores the fallback sentence.

## What this shows

The citation is written at ingest, in the chunk prefix, from the document's own structure. HTML uses the site's article anchors. PDFs use a vision pass that knows Điều from Khoản from Điểm, a repair pass that fixes broken boundaries without a model, and a labeler that is told the previous level and is not allowed to invent one. Retrieval then has a threshold and a fallback, so a miss is an explicit "not in the documents" rather than a fluent guess.
