/** Field rules shared with the site form (src/lib/contact-rules.ts). Keep in sync. */
export const CONTACT_LIMITS = { name: 100, email: 254, message: 2000 } as const;

export const contactRules = {
  name: (v: string) => {
    const t = v.trim();
    if (t.length < 2) return "Add your name (2 characters or more).";
    if (t.length > CONTACT_LIMITS.name)
      return `Keep your name under ${CONTACT_LIMITS.name} characters.`;
    return "";
  },
  email: (v: string) => {
    const t = v.trim();
    if (t.length > CONTACT_LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t))
      return "Check the email address. It needs an @ and a domain.";
    return "";
  },
  message: (v: string) => {
    const t = v.trim();
    if (t.length < 10) return "Add a little more (10 characters or more).";
    if (t.length > CONTACT_LIMITS.message)
      return `Keep it under ${CONTACT_LIMITS.message} characters (it's ${t.length} now).`;
    return "";
  },
} as const;

export const HONEYPOT_FIELD = "website";
