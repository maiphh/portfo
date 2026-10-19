/**
 * POST /api/contact core: honeypot, validation, Turnstile, rate limit, then the
 * message and its `classify_and_notify` job are inserted in one transaction.
 * The Astro endpoint maps the result to JSON or a no-JS HTML page.
 */
import type { Db } from "~/db/client";
import { enqueue } from "~/db/queue";
import { hitRateLimit } from "~/db/rate-limit";
import { contactMessages } from "~/db/schema";
import { HONEYPOT_FIELD, TURNSTILE_FIELD } from "~/lib/contact-rules";
import { ConfigError, type Env, type Logger } from "../env";
import { verifyTurnstile } from "../turnstile";
import { dailySalt, visitorHash } from "../visitor";
import { parseContact, type ContactFieldErrors, type ContactSubmission } from "./schema";

export const CONTACT_JOB = "classify_and_notify";
export const CONTACT_LIMIT_PER_DAY = 3;
export const DAY_MS = 24 * 60 * 60_000;

export interface ContactJobPayload {
  messageId: number;
  /** What the sender picked in "You're writing as", if anything. A hint, not the answer. */
  roleHint?: ContactSubmission["role"];
}

export type SubmitResult =
  | { kind: "accepted"; messageId: number; jobId: number }
  | { kind: "honeypot" }
  | { kind: "invalid"; fieldErrors: ContactFieldErrors }
  | { kind: "captcha_failed" }
  | { kind: "rate_limited"; resetAt: Date }
  | { kind: "unavailable"; reason: string };

export interface SubmitDeps {
  db: Db;
  env: Env;
  log: Logger;
  now?: Date;
  fetch?: typeof fetch;
}

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function submitContact(
  raw: Record<string, unknown>,
  meta: RequestMeta,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  const { db, env, log } = deps;
  const now = deps.now ?? new Date();

  // Bots fill every field. Pretend it worked and store nothing.
  if (str(raw[HONEYPOT_FIELD])?.trim()) {
    log.info("[contact] honeypot filled; dropping the submission");
    return { kind: "honeypot" };
  }

  const parsed = parseContact(raw);
  if (!parsed.ok) return { kind: "invalid", fieldErrors: parsed.fieldErrors };

  const captcha = await verifyTurnstile(str(raw[TURNSTILE_FIELD]), meta.ip, {
    env,
    log,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
  if (!captcha.ok) {
    return captcha.reason === "not_configured"
      ? { kind: "unavailable", reason: "turnstile_not_configured" }
      : { kind: "captcha_failed" };
  }

  let hash: string;
  try {
    hash = visitorHash(meta.ip, meta.userAgent, dailySalt(env, now, log));
  } catch (err) {
    if (err instanceof ConfigError) {
      log.error(`[contact] ${err.message}`);
      return { kind: "unavailable", reason: "visitor_salt_not_configured" };
    }
    throw err;
  }

  const limit = await hitRateLimit(db, {
    key: `contact:${hash}`,
    limit: CONTACT_LIMIT_PER_DAY,
    windowMs: DAY_MS,
    now,
  });
  if (!limit.allowed) return { kind: "rate_limited", resetAt: limit.resetAt };

  const { data } = parsed;
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(contactMessages)
      .values({ name: data.name, email: data.email, body: data.message, visitorHash: hash })
      .returning({ id: contactMessages.id });
    if (!message) throw new Error("contact insert returned no row");
    const payload: ContactJobPayload = {
      messageId: message.id,
      ...(data.role ? { roleHint: data.role } : {}),
    };
    const job = await enqueue(tx, { type: CONTACT_JOB, payload });
    return { kind: "accepted" as const, messageId: message.id, jobId: job.id };
  });
}
