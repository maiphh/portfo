/**
 * Legal RAG assistant case study. Sources: projects/chatbot-pyr/{README,architecture,highlights}.md
 * (portfo main) and the Legal RAG moodboard (portfo-design case-studies/moodboards/legal-rag.md,
 * flow-example/others/legal-rag-flow.html). No statute text, no source documents, no result figures.
 */
import type { CaseStudyData } from "~/lib/case";
import { examplePrefix } from "./example";

export const legalRag: CaseStudyData = {
  motion: "rag",
  signatureCaption:
    "Illustration: an article schematic with placeholder text and a generic document number. The address is written onto the chunk when it's stored.",
  overview: {
    problem:
      "Payroll consultants answer from Vietnamese legal documents and must cite the exact place: the document number, the Điều and the Khoản under it. A fixed-size split drops that path, so a passage can't say which article it came from. Documents aren't one shape either: a công văn often has no Điều at all, and pages break mid-article.",
    solution:
      "Ingest every document so each stored chunk carries its place in the hierarchy, then retrieve those chunks and require the answer to cite that place. Two ingest paths do the labelling: a link's HTML is split on the page's own article anchors, and an uploaded PDF is read by a vision-language model into marked-up text that a hybrid chunker labels.",
    outcomeTodo: "The pack leaves the result as a placeholder for Phu.",
  },
  highlight: {
    title: "The chunk is the citation",
    caption:
      "Illustration of the stored chunk format from projects/chatbot-pyr/highlights.md. Generic document number; the body is a placeholder, no statute text.",
  },
  how: {
    summary:
      "One FastAPI process and a Next.js app on PostgreSQL with pgvector. No queue and no Redis: ingest and questions run in the request. Select any part to see what it does, its tech and the decision behind it.",
    stack: [
      { label: "API", value: "FastAPI", version: "Python 3.12" },
      { label: "Frontend", value: "Next.js", version: "16.0.7" },
      { label: "Vectors", value: "pgvector", version: "4096-d" },
      { label: "Embeddings", value: "On-prem qwen3-embed-8b" },
      { label: "LLM and VLM", value: "On-prem LLM" },
      { label: "Sign-in", value: "Microsoft Entra ID" },
    ],
    flow: {
      cols: 6,
      label: "Parts of the system: ingest above, a question below",
      keyLabel: "on a citation's path",
      groups: { in: "Ingest", ask: "Question" },
      nodes: [
        {
          id: "web",
          title: "Next.js app",
          sub: "browser client",
          at: [2, 1],
          key: true,
          details: {
            does: "The chat and upload screens. Signs in with Microsoft Entra and renders answers as markdown with their citation line.",
            tech: [
              "Next.js `16.0.7`, React `19.2.0`, TypeScript 5",
              "@azure/msal-browser `^4.27`",
              "react-markdown, remark-gfm, Radix, Tailwind CSS 4",
            ],
            why: "The app never holds the answer logic. It sends the Entra token to `POST /auth/session` once and talks to the API with the backend's own JWT.",
          },
        },
        {
          id: "api",
          title: "FastAPI",
          sub: "ingest and ask",
          at: [2, 2],
          key: true,
          details: {
            does: "One process for both jobs: storing documents and answering questions. Files and crawled HTML live on the document row; embeddings live on the chunk row.",
            tech: ["FastAPI, Uvicorn, Python `3.12`", "SQLAlchemy, asyncpg", "PyJWT session"],
            why: "No queue and no Redis. Ingest and chat run in the request, which keeps the system small enough for one team to run on-prem.",
          },
        },
        {
          id: "link",
          title: "Legal-site link",
          sub: "HTML source",
          at: [1, 3],
          group: "in",
          details: {
            does: "A link to a page on a Vietnamese legal-document site. The law id is read from the URL and the site's document API returns the HTML.",
            tech: ["Document-detail API, BeautifulSoup"],
            why: "A missing id or a failed request rejects the link. The page scrape that would run after an API failure isn't on this path, so nothing half-read gets stored.",
          },
        },
        {
          id: "html",
          title: "HTML tag chunker",
          sub: "the page's own anchors",
          at: [1, 4],
          key: true,
          group: "in",
          details: {
            does: "Walks the paragraphs and starts a new chunk only at the page's own article anchor, then writes the document address at the head of the chunk.",
            tech: ['Splits on `<a name="dieu_N">`', `Prefix \`${examplePrefix}\``],
            why: "It doesn't split on the word 'Điều': a paragraph that mentions another article would become a false boundary. The citation comes from the document's own structure.",
          },
        },
        {
          id: "pdf",
          title: "PDF or image",
          sub: "scanned or digital",
          at: [2, 3],
          group: "in",
          details: {
            does: "An uploaded file with no anchors to trust. Pages are rendered to images and read one at a time, in order.",
            tech: [
              "pypdfium2 page render",
              "Docling for other text files, an email parser for mail",
            ],
            why: "One page at a time keeps the order exact, so a page that starts mid-article can be joined to the one before.",
          },
        },
        {
          id: "vlm",
          title: "VLM markdown",
          sub: "Điều · Khoản · Điểm",
          at: [2, 4],
          group: "in",
          details: {
            does: "A vision-language model turns each page into markdown that marks `## Điều`, `### Khoản` and `#### Điểm`.",
            tech: ["On-prem LLM, chat completions over HTTP"],
            why: "The prompt is the contract: a bare '4.' is not 'Điều 4', and a page that starts at '2.' continues the previous article. The model may not add, drop or reword.",
          },
        },
        {
          id: "hybrid",
          title: "Hybrid legal chunker",
          sub: "repair, then label",
          at: [2, 5],
          key: true,
          group: "in",
          details: {
            does: "Splits on legal boundaries, repairs bad splits with rules, then has a model label each block with the document id, the title and its level path.",
            tech: [
              "Stamp `[doc id | title | level]`",
              "3 JSON attempts, then semantic splitting",
              "Near-duplicates in one Điều collapsed",
            ],
            why: "The model is told the previous block's level, so '3.' stays under that article, and it may not invent a Điều for a công văn.",
          },
        },
        {
          id: "db",
          title: "PostgreSQL + pgvector",
          sub: "chunks with their address",
          at: [2, 6],
          key: true,
          details: {
            does: "Stores each chunk with its address prefix and its embedding.",
            tech: [
              "pgvector `Vector(4096)`, cosine distance",
              "Schema created and migrated on startup",
            ],
            why: "The address travels with the text it labels, so whatever retrieval returns can already say where it came from.",
          },
        },
        {
          id: "embed",
          title: "Embed the question",
          sub: "on-prem embeddings",
          at: [3, 3],
          key: true,
          group: "ask",
          details: {
            does: "Embeds the question with the same on-prem model used for the chunks.",
            tech: ["`qwen3-embed-8b`, 4096 dimensions"],
            why: "Same model, same space: the column size and the provider are matched on purpose.",
          },
        },
        {
          id: "near",
          title: "Cosine top-k",
          sub: "rerank off by default",
          at: [3, 4],
          key: true,
          group: "ask",
          details: {
            does: "Takes the nearest chunks by cosine distance. An optional cross-encoder can rerank them and drop weak matches.",
            tech: [
              "`top_k` 6 by default",
              "Rerank: `BAAI/bge-reranker-v2-m3`, threshold 0.7, keep 2",
            ],
            why: "Rerank runs off the event loop and is off in the default config. When it's on, anything under the threshold is dropped, which can leave nothing, on purpose.",
          },
        },
        {
          id: "answer",
          title: "Answer, or fallback",
          sub: "no match: fixed sentence",
          at: [3, 5],
          key: true,
          group: "ask",
          details: {
            does: "With chunks, the model answers from them only: a citation line (document number, Điều, Khoản), a quote, then the answer. With none, the assistant stores a fixed fallback sentence.",
            tech: ["System prompt: retrieved context only", "Fallback without a model call"],
            why: "An empty retrieval never reaches the model, so a miss is an explicit 'not in the documents' instead of a fluent guess.",
          },
        },
        {
          id: "llm",
          title: "On-prem LLM",
          sub: "inside the network",
          at: [3, 6],
          details: {
            does: "Serves the answer, the page reads and the chunk labels over HTTP.",
            tech: ["Chat completions over `httpx`"],
            why: "Documents and questions stay inside the company network.",
          },
        },
      ],
      edges: [
        ["web", "api"],
        ["api", "link"],
        ["api", "pdf"],
        ["link", "html"],
        ["pdf", "vlm"],
        ["vlm", "hybrid"],
        ["html", "db"],
        ["hybrid", "db"],
        ["api", "embed"],
        ["embed", "near"],
        ["near", "db"],
        ["near", "answer"],
        ["answer", "llm", "dotted"],
      ],
    },
  },
  dives: [
    {
      id: "repair",
      title: "The label survives a page break and a bad split",
      paragraphs: [
        "The coarse split prefers legal boundaries: markdown headers and the words Điều, Phụ lục and Chương come before any ordinary newline, in 4,000-character pieces.",
        "Then a regex pass repairs what it can see, before any model does: a piece that ends on a bare 'Điều N' is merged into the body that follows, a sentence cut mid-line is joined, and a lone 'Khoản 1' under 50 characters moves forward.",
        "Each block is then labelled with the previous block's level as a hint, so a block that opens with '3.' or 'c)' stays under that article. The first good document id and the longest complete title are locked, so a middle page can't wipe the citation header.",
      ],
      shows: "The model is never asked to fix a split that a rule can see.",
      caption:
        "Schematic of the repair rules in projects/chatbot-pyr/highlights.md. No document content.",
    },
    {
      id: "fallback",
      title: "A failed label doesn't drop the document",
      paragraphs: [
        "The labeller must return JSON only. The parser strips code fences and keeps only the brace-matched object if the model adds anything after it. Each block gets 3 attempts.",
        "After the third failure, that block is split by meaning instead (a Vietnamese bi-encoder, breaking where sentence similarity drops) rather than discarded. Any other error keeps the raw block.",
        "Last, near-duplicates are removed: a chunk that closely matches the one before it, or that is contained in it within the same Điều, is dropped and the longer one stays.",
      ],
      shows: "Each step degrades to a simpler method instead of losing text.",
      caption:
        "Illustration of the documented fallback chain (projects/chatbot-pyr/highlights.md).",
    },
    {
      id: "refuse",
      title: "Retrieval is allowed to say nothing",
      paragraphs: [
        "The question is embedded and compared by cosine distance; there is no keyword index in this service. With rerank on, scores pass through a sigmoid and anything under the threshold is dropped.",
        "If nothing is left, the assistant never calls the model. It stores the fallback sentence, 'Xin lỗi, tôi không tìm thấy thông tin cần thiết.' ('Sorry, I couldn't find the information needed.'). With chunks, the prompt allows only the retrieved context and requires the citation line first.",
      ],
      shows: "A miss is an explicit answer, not a fluent guess.",
      caption: "The default fallback sentence and config defaults. Settings, not results.",
    },
  ],
  limits: {
    notShown: [
      "Source documents, crawled statute text and questions people asked.",
      "Screens of the live app, source code and internal identifiers.",
      "A result figure, until one is confirmed for publication.",
    ],
    deprecated: [
      "An earlier prototype (separate ingestion and search apps, with hybrid search) isn't on the request path.",
      "A deterministic splitter that would write `[source | Điều N | Khoản M]` exists in the code, but nothing calls it.",
      "The page-scrape fallback for links exists but the link upload doesn't use it.",
    ],
    reserved: [
      "Reranking is built but off in the default config.",
      "The HTML path stops at Điều: Khoản and Điểm stay inside the article body there.",
    ],
    docsLag: [
      "Two defaults name different chat models; `POST /chat` uses the request's model, not the config row's.",
      "The config row stores temperature and top-p, but the client sends fixed low values.",
      "The client always asks for JSON, which the chunker needs; the answer prompt asks for prose. Both share it.",
      "The embedding service's own default argument is a small local model; the live singleton uses the on-prem 4096-dimension model that the column expects.",
    ],
    stack: [
      {
        title: "Backend",
        rows: [
          ["Language", "Python `3.12`"],
          ["API", "FastAPI, Uvicorn"],
          ["Database", "PostgreSQL, SQLAlchemy, asyncpg (requests), psycopg2 (sync)"],
          ["Vectors", "pgvector `Vector(4096)`, cosine distance"],
          ["LLM and VLM", "On-prem LLM, chat completions over HTTP (`httpx`)"],
          ["Embeddings", "On-prem, `qwen3-embed-8b`"],
          ["Rerank", "sentence-transformers CrossEncoder, `BAAI/bge-reranker-v2-m3`"],
          ["Files", "pypdfium2 page render, Docling, extract-msg, BeautifulSoup"],
          ["Auth", "MSAL token in, PyJWT session out (Microsoft Entra)"],
        ],
      },
      {
        title: "Frontend",
        rows: [
          ["Framework", "Next.js `16.0.7`"],
          ["UI", "React `19.2.0`, TypeScript 5, Tailwind CSS 4, Radix"],
          ["Auth", "@azure/msal-browser `^4.27`"],
          ["Answers", "react-markdown, remark-gfm"],
        ],
      },
    ],
    stackSource:
      "Versions from the project's requirements, Dockerfile and package.json when the pack was written.",
  },
};
