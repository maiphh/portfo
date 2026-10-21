/**
 * Sample replies for the chat window while PUBLIC_USE_MOCKS is on or PUBLIC_WORKER_URL is unset.
 * CV facts only, phrased like the real assistant, and labelled as samples in the panel.
 */
import type { Source } from "~/lib/chat/sse";

export interface MockReply {
  /** Lowercase keywords; the reply with the most hits wins. */
  keys: string[];
  steps: { tool: string; label: string }[];
  answer: string;
  sources: Source[];
}

const ocr: Source = { title: "Document OCR pipeline", href: "/work/document-ocr" };
const rag: Source = { title: "Legal RAG assistant", href: "/work/legal-rag" };
const craftland: Source = { title: "Free Fire Craftland", href: "/#work-craftland" };
const timeline: Source = { title: "Experience", href: "/#timeline" };

export const mockReplies: MockReply[] = [
  {
    keys: ["ocr", "accura", "document", "invoice", "pipeline"],
    steps: [{ tool: "get_project", label: "Reading the case study…" }],
    answer:
      "The document OCR pipeline is template-driven: a vision-language model reads each page, a schema says which fields to find, and rules check the result before operators review and export Excel. Phu built it solo, and it runs in production at Talentnet. Two months after go-live: 8,000 pages processed, accuracy 99.6% and about 300 hours saved.",
    sources: [ocr, timeline],
  },
  {
    keys: ["rag", "legal", "citation", "cite", "chunk", "law"],
    steps: [
      { tool: "list_projects", label: "Looking up projects…" },
      { tool: "get_project", label: "Reading the case study…" },
    ],
    answer:
      "Its Tag Chunker keeps the full Điều › Khoản › Điểm path on every chunk, so each answer points to the correct document and a reference you can cite. Phu built the legal RAG payroll assistant solo at Talentnet.",
    sources: [rag],
  },
  {
    keys: ["garena", "free fire", "craftland", "game"],
    steps: [{ tool: "get_project", label: "Reading the case study…" }],
    answer:
      "At Garena Free Fire, Phu built 14 game modes on Craftland, Free Fire's creation platform, from Dec 2023 to Sep 2025. Two were officially featured, and together they drew about 6.2 million positive interactions from players.",
    sources: [craftland, timeline],
  },
  {
    keys: ["contact", "email", "hire", "reach"],
    steps: [{ tool: "get_contact", label: "Getting contact details…" }],
    answer:
      "The quickest way is the contact form at the bottom of the page, or email maiphh29@gmail.com.",
    sources: [{ title: "Contact", href: "/#contact" }],
  },
];

export const fallbackReply: MockReply = {
  keys: [],
  steps: [
    { tool: "list_projects", label: "Looking up projects…" },
    { tool: "get_experience", label: "Checking the CV…" },
  ],
  answer:
    "Phu is an AI engineer in Ho Chi Minh City. At Talentnet he has shipped a document OCR pipeline and a legal RAG assistant to production, and earlier 14 game modes for Garena Free Fire's Craftland.",
  sources: [ocr, rag, craftland],
};

export function pickMockReply(question: string): MockReply {
  const q = question.toLowerCase();
  let best = fallbackReply;
  let score = 0;
  for (const r of mockReplies) {
    const s = r.keys.filter((k) => q.includes(k)).length;
    if (s > score) {
      best = r;
      score = s;
    }
  }
  return best;
}
