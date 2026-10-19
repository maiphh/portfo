/**
 * "Email Phu" behind an interface, so tests use a fake. The real one calls the
 * Resend REST API with an idempotency key, so a retried job never sends twice.
 */
import type { ContactCategory } from "~/lib/types";
import type { Env } from "../env";

export interface NotifyInput {
  messageId: number;
  name: string;
  email: string;
  body: string;
  category: ContactCategory;
  confidence: number;
  createdAt: Date;
}

export interface Notifier {
  notify(input: NotifyInput): Promise<void>;
}

export const RESEND_URL = "https://api.resend.com/emails";
export const DEFAULT_FROM = "Portfolio contact <onboarding@resend.dev>";

export function formatEmail(input: NotifyInput): { subject: string; text: string } {
  const pct = Math.round(input.confidence * 100);
  const name = input.name.replace(/[\r\n]+/g, " ").slice(0, 80);
  return {
    subject: `[portfolio] ${input.category}: ${name}`,
    text: [
      `From: ${input.name} <${input.email}>`,
      `Sorted as: ${input.category} (${pct}% confident)`,
      `Received: ${input.createdAt.toISOString()}`,
      `Message #${input.messageId}`,
      "",
      input.body,
      "",
      "Reply to this email to answer them directly.",
    ].join("\n"),
  };
}

export interface ResendOptions {
  apiKey: string;
  to: string;
  from?: string;
  fetch?: typeof fetch;
}

export function createResendNotifier(opts: ResendOptions): Notifier {
  const doFetch = opts.fetch ?? fetch;
  return {
    async notify(input) {
      const { subject, text } = formatEmail(input);
      const res = await doFetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `contact-message-${input.messageId}`,
        },
        body: JSON.stringify({
          from: opts.from ?? DEFAULT_FROM,
          to: [opts.to],
          reply_to: input.email,
          subject,
          text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(`Resend responded ${res.status}: ${detail}`);
      }
    },
  };
}

/** The production notifier. Missing config fails the job (and is retried), never silently. */
export function defaultNotifier(env: Env = process.env): Notifier {
  return {
    async notify(input) {
      if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) {
        throw new Error("RESEND_API_KEY and NOTIFY_EMAIL must be set to send notifications.");
      }
      const from = env.RESEND_FROM;
      await createResendNotifier({
        apiKey: env.RESEND_API_KEY,
        to: env.NOTIFY_EMAIL,
        ...(from ? { from } : {}),
      }).notify(input);
    },
  };
}
