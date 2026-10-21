import { z } from "zod";
import { contactRules } from "./rules";

const rule = (check: (v: string) => string) =>
  z
    .string({ error: () => check("") })
    .superRefine((v, ctx) => {
      const message = check(v);
      if (message) ctx.addIssue({ code: "custom", message });
    })
    .transform((v) => v.trim());

export const contactSchema = z.object({
  name: rule(contactRules.name),
  email: rule(contactRules.email),
  message: rule(contactRules.message),
  role: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.enum(["recruiter", "client", "other"], { error: "Pick one of the options." }).optional(),
  ),
});

export type ContactSubmission = z.infer<typeof contactSchema>;
export type ContactFieldErrors = Partial<Record<keyof ContactSubmission, string>>;

export function parseContact(
  raw: Record<string, unknown>,
): { ok: true; data: ContactSubmission } | { ok: false; fieldErrors: ContactFieldErrors } {
  const result = contactSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: ContactFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof ContactSubmission | undefined;
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors };
}
