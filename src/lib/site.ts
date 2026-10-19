/** Facts used across the site. Only CV-level facts that are in the design brief. */
export const site = {
  name: "Mai Gia Phu",
  role: "AI Engineer",
  city: "Ho Chi Minh City",
  email: "maiphh29@gmail.com",
  github: "https://github.com/maiphh",
  githubHandle: "maiphh",
  title: "Mai Gia Phu · AI Engineer, Ho Chi Minh City",
  description:
    "Mai Gia Phu is an AI engineer in Ho Chi Minh City who ships production AI tools: document OCR and legal RAG at Talentnet, 14 game modes at Garena Free Fire.",
} as const;

/** Open content and decision TODOs (shown in the ?dev panel while mocks are on). */
export const todos: readonly string[] = [
  'GitHub display name shows "Lucas Mai": confirm which name the site uses.',
  "Legal RAG: outcome metric (only the qualitative outcome is stated).",
  "LinkedIn URL, résumé PDF, headshot, short bio.",
  "OpenPortfo, Mirror Now, Poet: live URLs, repos, any metrics.",
  "LLM provider (copy is provider-agnostic until chosen; Gemini is the default to wire up).",
  "Cloudflare Turnstile widget on the contact form.",
  "Reply-time promise on the contact section (left out rather than invented).",
  "All numbers marked † (views, GitHub stats, sync time, Ask answers, the OpenPortfo chart) are sample data.",
];
