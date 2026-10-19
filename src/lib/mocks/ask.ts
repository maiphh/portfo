/**
 * SAMPLE DATA † — canned "Ask about my work" answers, built only from CV facts in the brief.
 * The real version is POST /api/chat: pgvector top-k over the CV + case studies, then a
 * grounded, cited answer from the configured LLM (see src/lib/ai/provider.ts).
 */
import type { AskAnswer, AskPassage } from "../types";

const VI = (s: string) => `<span lang="vi">${s}</span>`;
const VI_CODE = (s: string) => `<span class="vi" lang="vi">${s}</span>`;

const P = {
  cvT: {
    source: "cv · Talentnet",
    html: "AI Engineer Specialist, Sep 2025 – now. Document OCR and legal RAG, both built solo.",
  },
  ocr: {
    source: "case study · document OCR",
    html: "Schema- and rule-driven pipeline on a vision-language model. Over 98% accuracy; more than 90% of processing time saved.",
  },
  rag: {
    source: "case study · legal RAG",
    html: `Tag Chunker keeps the ${VI("Điều / Khoản / Điểm")} path on every chunk. Answers point to the correct document.`,
  },
  cvG: { source: "cv · Garena", html: "Game Developer, Garena Free Fire, Dec 2023 – Sep 2025." },
  craft: {
    source: "case study · Craftland",
    html: "14 game modes; 2 officially featured; about 6.2M positive interactions.",
  },
  edu: {
    source: "cv · education",
    html: "Master of AI, RMIT, 2025 – 2028. Bachelor of IT, RMIT University, 2021 – 2024: GPA 3.7, Scholar's List (top 5%), top 10 graduates. IELTS 7.0.",
  },
  award: { source: "cv · awards", html: "Neo League 2025: 2nd runner-up of about 100 teams." },
  proj: {
    source: "projects",
    html: "OpenPortfo (crypto + Vietnamese stocks), the Mirror Now storefront and e-commerce template, a site for the Poet charity.",
  },
  how: {
    source: "site · how it works",
    html: "Vercel static pages + /api routes; Neon Postgres with pgvector; jobs table with SKIP LOCKED and retries; GitHub sync every 6 hours.",
  },
  contact: {
    source: "site · contact",
    html: "maiphh29@gmail.com · github.com/maiphh · the form on this page.",
  },
} satisfies Record<string, AskPassage>;

interface Rule extends AskAnswer {
  re: RegExp;
}

const KB: Rule[] = [
  {
    re: /ocr|accura|document|vlm|vision|invoice/i,
    passages: [P.ocr, P.cvT],
    html: "Over 98% accurate, and it saves more than 90% of processing time [1]. A vision-language model reads the page, a schema says which fields to find, and rules check the result before it's handed on. He built it on his own at Talentnet [2].",
    citations: [
      { label: "Document OCR", href: "#work-ocr" },
      { label: "CV", href: "#timeline" },
    ],
  },
  {
    re: /rag|legal|citation|cite|payroll|chunk|law|điều/i,
    passages: [P.rag, P.cvT],
    html: `His Tag Chunker keeps each passage's full path, ${VI_CODE("Điều › Khoản › Điểm")}, so answers point to the correct document and to a reference you can cite [1]. He built it solo at Talentnet; an outcome figure isn't published yet [2].`,
    citations: [
      { label: "Legal RAG", href: "#work-rag" },
      { label: "CV", href: "#timeline" },
    ],
  },
  {
    re: /garena|free ?fire|craftland|game/i,
    passages: [P.craft, P.cvG],
    html: "14 game modes on Free Fire's Craftland. Two were officially featured, and together they drew about 6.2 million positive player interactions [1]. He was a Game Developer there from Dec 2023 to Sep 2025 [2].",
    citations: [
      { label: "Craftland", href: "#work-craftland" },
      { label: "CV", href: "#timeline" },
    ],
  },
  {
    re: /stud|educat|rmit|degree|gpa|ielts|school|master|universit|bachelor/i,
    passages: [P.edu],
    html: "He's doing a Master of AI at RMIT (2025 – 2028). His Bachelor of IT at RMIT University (2021 – 2024) ended with a 3.7 GPA, the Scholar's List (top 5%) and a place in the top 10 graduates. IELTS 7.0 [1].",
    citations: [{ label: "Timeline", href: "#timeline" }],
  },
  {
    re: /award|neo|league|compet|win|prize|hackathon/i,
    passages: [P.award],
    html: "His team placed 2nd runner-up at Neo League 2025, out of about 100 teams [1].",
    citations: [{ label: "Timeline", href: "#timeline" }],
  },
  {
    re: /contact|email|hire|reach|available|talk/i,
    passages: [P.contact],
    html: "Email maiphh29@gmail.com, or use the form at the bottom of this page. His code is on github.com/maiphh [1].",
    citations: [{ label: "Contact", href: "#contact" }],
  },
  {
    re: /openportfo|mirror|poet|side|client|stock|crypto|shop|store|charity/i,
    passages: [P.proj],
    html: "Three of his own: OpenPortfo, a tracker for crypto and Vietnamese stocks; the Mirror Now storefront, turned into a reusable e-commerce template; and a website for the Poet charity [1].",
    citations: [
      { label: "OpenPortfo", href: "#work-openportfo" },
      { label: "Mirror Now", href: "#work-mirror" },
      { label: "Poet", href: "#work-poet" },
    ],
  },
  {
    re: /this site|portfolio|architect|stack|backend|pgvector|neon|vercel|queue|built this|how .*(site|work)/i,
    passages: [P.how],
    html: "Static pages on Vercel, with /api routes that run only when called. Neon Postgres holds everything, pgvector included. Messages go through a jobs table that workers claim with FOR UPDATE SKIP LOCKED, with retries. GitHub activity syncs every 6 hours [1].",
    citations: [{ label: "How this site works", href: "#how" }],
  },
  {
    re: /ship|production|built|work|do|experience|job/i,
    passages: [P.cvT, P.ocr, P.rag],
    html: `Two systems at Talentnet, both built solo [1]: a document OCR pipeline that's over 98% accurate and saves more than 90% of processing time [2], and a legal RAG payroll assistant whose answers point to the exact ${VI_CODE("Điều / Khoản / Điểm")} [3].`,
    citations: [
      { label: "CV", href: "#timeline" },
      { label: "Document OCR", href: "#work-ocr" },
      { label: "Legal RAG", href: "#work-rag" },
    ],
  },
];

const NOPE: AskAnswer = {
  passages: [],
  html: "Nothing in his CV or case studies answers that, so I won't guess. Try one of the suggestions, or ask him directly.",
  citations: [{ label: "Contact", href: "#contact" }],
};

/** Suggested prompts shown as chips. */
export const askSuggestions: readonly string[] = [
  "How accurate is the OCR pipeline?",
  "How does the legal RAG keep citations exact?",
  "What did he build at Garena?",
  "Where did he study?",
];

/** The pre-rendered first turn (visible without JS). */
export const askFirstQuestion = "What has he shipped in production?";

export function mockAsk(question: string): AskAnswer {
  const hit = KB.find((k) => k.re.test(question)) ?? NOPE;
  return { passages: hit.passages, html: hit.html, citations: hit.citations };
}
