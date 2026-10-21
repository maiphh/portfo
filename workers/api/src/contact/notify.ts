/** Resend email for a stored contact message. Idempotency-Key prevents double-sends. */
import type { Env } from "../env";

export type ContactRole = "recruiter" | "client" | "other";

export interface NotifyInput {
  messageId: number;
  name: string;
  email: string;
  body: string;
  role?: ContactRole;
  createdAt: Date;
}

export interface Notifier {
  notify(input: NotifyInput): Promise<void>;
}

export const RESEND_URL = "https://api.resend.com/emails";
export const DEFAULT_FROM = "Portfolio contact <onboarding@resend.dev>";

const ROLE_LABEL: Record<ContactRole, string> = {
  recruiter: "recruiter",
  client: "client",
  other: "something else",
};

export function formatEmail(input: NotifyInput): { subject: string; text: string } {
  const name = input.name.replace(/[\r\n]+/g, " ").slice(0, 80);
  const lines = [
    `From: ${input.name} <${input.email}>`,
    ...(input.role ? [`Writing as: ${ROLE_LABEL[input.role]}`] : []),
    `Received: ${input.createdAt.toISOString()}`,
    `Message #${input.messageId}`,
    "",
    input.body,
    "",
    "Reply to this email to answer them directly.",
  ];
  return { subject: `[portfolio] ${name}`, text: lines.join("\n") };
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

export function defaultNotifier(env: Env, doFetch: typeof fetch = fetch): Notifier {
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
        fetch: doFetch,
      }).notify(input);
    },
  };
}
