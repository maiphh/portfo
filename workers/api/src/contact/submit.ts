/**
 * POST /contact: honeypot → validate → visitor hash → INSERT → Resend.
 * The visitor waits for the email. If Resend fails, the row stays and the response is email_failed.
 */
import { ConfigError, type Env, type Logger } from "../env";
import { dailySalt, visitorHash } from "../visitor";
import { defaultNotifier, type Notifier } from "./notify";
import { HONEYPOT_FIELD } from "./rules";
import { parseContact, type ContactFieldErrors, type ContactSubmission } from "./schema";

export type SubmitResult =
  | { kind: "accepted"; messageId: number; name: string }
  | { kind: "honeypot" }
  | { kind: "invalid"; fieldErrors: ContactFieldErrors }
  | { kind: "email_failed"; messageId: number }
  | { kind: "unavailable"; reason: string };

export interface SubmitDeps {
  db: D1Database;
  env: Env;
  log: Logger;
  now?: Date;
  fetch?: typeof fetch;
  notifier?: Notifier;
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

  if (str(raw[HONEYPOT_FIELD])?.trim()) {
    log.info("[contact] honeypot filled; dropping the submission");
    return { kind: "honeypot" };
  }

  const parsed = parseContact(raw);
  if (!parsed.ok) return { kind: "invalid", fieldErrors: parsed.fieldErrors };

  let hash: string;
  try {
    hash = await visitorHash(meta.ip, meta.userAgent, dailySalt(env, now, log));
  } catch (err) {
    if (err instanceof ConfigError) {
      log.error(`[contact] ${err.message}`);
      return { kind: "unavailable", reason: "visitor_salt_not_configured" };
    }
    throw err;
  }

  const { data } = parsed;
  const createdAt = now.toISOString();
  const insert = await db
    .prepare(
      `INSERT INTO contact_messages (name, email, body, role, visitor_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(data.name, data.email, data.message, data.role ?? null, hash, createdAt)
    .first<{ id: number }>();
  if (!insert) throw new Error("contact insert returned no row");
  const messageId = insert.id;

  const notifier = deps.notifier ?? defaultNotifier(env, deps.fetch ?? fetch);
  try {
    await notifier.notify({
      messageId,
      name: data.name,
      email: data.email,
      body: data.message,
      ...(data.role ? { role: data.role } : {}),
      createdAt: now,
    });
  } catch (err) {
    log.error("[contact] Resend failed; row kept", err);
    return { kind: "email_failed", messageId };
  }

  return { kind: "accepted", messageId, name: data.name };
}

export type { ContactSubmission };
