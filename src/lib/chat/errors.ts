/** Friendly copy for every way a chat turn can fail. */
import { site } from "~/lib/site";

export type ChatErrorCode =
  | "rate_limited"
  | "daily_limit"
  | "network"
  | "interrupted"
  | "turnstile_required"
  | "turnstile_failed"
  | "turnstile_unavailable"
  | "too_long"
  | "not_configured"
  | "forbidden_origin"
  | "bad_request"
  | "upstream_error"
  | "unknown";

export interface ChatError {
  code: ChatErrorCode;
  message: string;
  /** Whether "try again" makes sense right away. */
  retry: boolean;
}

const KNOWN = new Set<string>([
  "rate_limited",
  "daily_limit",
  "network",
  "interrupted",
  "turnstile_required",
  "turnstile_failed",
  "turnstile_unavailable",
  "too_long",
  "not_configured",
  "forbidden_origin",
  "bad_request",
  "upstream_error",
]);

export function errorCode(raw: string | undefined, status?: number): ChatErrorCode {
  if (raw && KNOWN.has(raw)) return raw as ChatErrorCode;
  if (status === 429) return "rate_limited";
  if (status === 413) return "too_long";
  if (status === 503) return "not_configured";
  if (status !== undefined && status >= 500) return "upstream_error";
  return "unknown";
}

const mail = `email Phu at ${site.email}`;

export function friendlyError(
  code: ChatErrorCode,
  opts: { retryAfter?: number | null; serverMessage?: string } = {},
): ChatError {
  switch (code) {
    case "rate_limited": {
      const s = opts.retryAfter ?? 0;
      if (s > 60) {
        const min = Math.ceil(s / 60);
        return {
          code,
          retry: false,
          message: `That's a lot of questions at once. Try again in about ${min} minute${min === 1 ? "" : "s"}.`,
        };
      }
      return { code, retry: true, message: "Slow down a little and try again in a few seconds." };
    }
    case "daily_limit":
      return {
        code,
        retry: false,
        message:
          opts.serverMessage?.trim() ||
          `I've used up today's chat budget. I'll be back tomorrow (Ho Chi Minh City time). Until then you can ${mail}.`,
      };
    case "network":
      return {
        code,
        retry: true,
        message: "I couldn't reach the assistant. Check your connection and try again.",
      };
    case "interrupted":
      return { code, retry: true, message: "The answer got cut off. Try asking again." };
    case "turnstile_required":
    case "turnstile_failed":
      return {
        code,
        retry: true,
        message: "The quick bot check didn't go through. Try sending again.",
      };
    case "turnstile_unavailable":
      return {
        code,
        retry: true,
        message: `The bot check couldn't load (an ad blocker can stop it). Try again, or ${mail}.`,
      };
    case "too_long":
      return { code, retry: false, message: "Questions are limited to 500 characters." };
    case "not_configured":
    case "forbidden_origin":
      return {
        code,
        retry: false,
        message: `The chat isn't available right now. You can ${mail}.`,
      };
    case "bad_request":
      return { code, retry: false, message: "I couldn't read that question. Try rephrasing it." };
    case "upstream_error":
      return {
        code,
        retry: true,
        message: "The assistant is unavailable right now. Try again soon.",
      };
    default:
      return { code: "unknown", retry: true, message: "Something went wrong. Try again." };
  }
}
