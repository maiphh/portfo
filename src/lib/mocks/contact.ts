/**
 * SAMPLE † — simulates the contact pipeline (insert message + job, worker claims it,
 * LLM sorts it, Phu is emailed). Nothing is sent. The real version is POST /api/contact.
 */
import type { ContactCategory, ContactInput, ContactReceipt } from "../types";

/** Keyword stand-in for the LLM classifier. */
export function mockClassify(input: Pick<ContactInput, "role" | "message">): ContactCategory {
  if (input.role) return input.role;
  const text = input.message;
  if (/(seo services|giveaway|casino|https?:\/\/\S+.*https?:\/\/)/i.test(text)) return "spam";
  if (/hir|role|position|recruit|interview|job/i.test(text)) return "recruiter";
  if (/project|quote|budget|build|website/i.test(text)) return "client";
  return "other";
}

export function mockSubmitContact(input: ContactInput): ContactReceipt {
  return { jobId: "job_" + Math.random().toString(36).slice(2, 8), category: mockClassify(input) };
}
