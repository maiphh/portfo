/** Facts used across the site. Only CV-level facts that are in the design brief. */
export const site = {
  name: "Mai Gia Phu",
  role: "AI Engineer",
  city: "Ho Chi Minh City",
  email: "maiphh29@gmail.com",
  /** CV served from public/. */
  cv: "/CV-MaiGiaPhu.pdf",
  cvFile: "CV-MaiGiaPhu.pdf",
  github: "https://github.com/maiphh",
  githubHandle: "maiphh",
  title: "Mai Gia Phu · AI Engineer, Ho Chi Minh City",
  description:
    "Mai Gia Phu is an AI engineer in Ho Chi Minh City who ships production AI tools: document OCR, legal RAG and payroll data validation at Talentnet, 14 game modes at Garena Free Fire.",
} as const;

/** Open content and decision TODOs (shown in the ?dev panel while mocks are on). */
export const todos: readonly string[] = [
  'GitHub display name shows "Lucas Mai": confirm which name the site uses.',
  "Legal RAG: outcome metric (only the qualitative outcome is stated).",
  "Payroll data validation: outcome metric (how much manual work it removed).",
  "LinkedIn URL, headshot, short bio.",
  "OpenPortfo, Mirror Now, Poet: live URLs, repos, any metrics.",
  "Chat: the window shows sample replies until the portfo Worker is deployed, PUBLIC_WORKER_URL is set and mocks are off; the mascot lands next.",
  "Reply-time promise on the contact section (left out rather than invented).",
  "All numbers marked † (views, GitHub stats, sync time, the OpenPortfo chart) are sample data.",
];
