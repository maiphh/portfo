/** Field rules shared by the client form and (later) the /api/contact validator. */
export const contactRules = {
  name: (v: string) => (v.trim().length >= 2 ? "" : "Add your name (2 characters or more)."),
  email: (v: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
      ? ""
      : "Check the email address. It needs an @ and a domain.",
  message: (v: string) =>
    v.trim().length >= 10 ? "" : "Add a little more (10 characters or more).",
} as const;

export type ContactField = keyof typeof contactRules;
