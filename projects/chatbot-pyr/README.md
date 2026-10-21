# Legal RAG case-study brief

Factual notes for the payroll legal-assistant page. Do not invent metrics. Source documents and crawled statute text stay out of this pack.

The live tree is `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend` and `chatbot-pyr-frontend`. `chatbot-pyr-root/AI` is an earlier prototype (its own ingestion, search, and knowledge-base apps, plus draw.io diagrams). It is not imported by the backend. `chatbot-pyr-root/test/` is a snapshot. `Projects/chatbot-payroll` is a separate repo.

## Problem

Payroll consultants have to answer from Vietnamese legal documents and cite the exact place: the document number, the Điều, and the Khoản under it. A fixed-size split drops that path. A passage then cannot say which article it came from, and a model will quote a rule from nowhere.

The documents are not one shape. A nghị định has Điều / Khoản / Điểm. A công văn often has none, and inventing a Điều for it is wrong. Pages also break mid-article, so the next page can start at Khoản 2 of the article on the previous page.

## Solution

Ingest the document so every stored chunk carries its place in the hierarchy, then retrieve those chunks and require the answer to cite that place.

Two ingest paths do the labeling:

- A link on thuvienphapluat.vn is fetched from that site's document API. The HTML chunker splits on the page's own article anchors, not on the word "Điều" inside a paragraph.
- An uploaded PDF is read by a vision-language model into markdown that marks Điều, Khoản, and Điểm, including a page that continues the previous article. A hybrid chunker then labels each block with the document id, the title, and the level path.

At question time the query is embedded, nearest chunks come back from Postgres, and an optional cross-encoder can rerank them. If nothing qualifies, the assistant returns a fixed fallback and does not invent an answer. The system prompt tells it to cite the document number, điều, and khoản, and to quote the passage.

## What the 15s video shows

No 15-second motion file exists for this project. Searched `chatbot-pyr-root`, `chatbot-payroll`, and the rest of this machine. The only platform motion files found are the OCR and DVP cuts already copied under `projects/ocr` and `projects/dvp`.

## Highlights

Full notes, with the defaults and the file paths: [highlights.md](highlights.md).

- **The chunk is the citation.** Crawled pages split on `<a name="dieu_N">` and store `[document number > Điều N. Title]`. Uploaded PDFs go through a hybrid chunker that stamps `[document id | title | level]`, and the level is the path (Điều, or Chương > Điều, or a phụ lục item). A công văn is not given a fake Điều.
- **The label survives a page break and a bad split.** The vision prompt marks a continued Khoản as `###`, not as a new Điều. A regex repair merges a header that was cut off from its body, a sentence broken mid-line, and a hanging "Khoản 1". The model call that labels a block is told the previous block's level, so "3." stays under that article.
- **A failed label does not drop the document.** JSON from the labeler is retried 3 times. After that, that block falls back to semantic splitting. Near-duplicate chunks in the same Điều are collapsed.
- **Retrieval can refuse.** Embeddings are pgvector cosine distance. Rerank is a cross-encoder run off the event loop, with a sigmoid threshold. The default config leaves rerank off. An empty retrieval returns the fallback sentence instead of a generated answer.

## Result

_Placeholder. Phu will fill this in. Do not invent a metric._

## Sources

- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/main.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/chat.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/search.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/knowledge.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/chunk.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/splitter.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/prompt.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/crawl.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/upload.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/extract.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/llm.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/embedding/service.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/services/embedding/`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/models/document.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/models/system_config.py`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/requirements.txt`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/Dockerfile`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-frontend/package.json`
- `/Users/phu.mai/Projects/chatbot-pyr-root/chatbot-pyr-backend/app/routers/auth.py`
