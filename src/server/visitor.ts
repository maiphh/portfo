/**
 * visitor_hash = SHA-256(IP + UA + daily salt). No cookies and no raw IPs are stored.
 * The daily salt is VISITOR_HASH_SALT combined with the UTC date, so the same visitor
 * gets a new hash every day.
 */
import { createHash } from "node:crypto";
import { ConfigError, isProduction, type Env, type Logger } from "./env";

const DEV_SALT = "portfo-dev-salt";
let warned = false;

export function dailySalt(env: Env, now: Date, log?: Logger): string {
  let salt = env.VISITOR_HASH_SALT;
  if (!salt) {
    if (isProduction(env)) throw new ConfigError("VISITOR_HASH_SALT is not set in production.");
    if (!warned) {
      log?.warn("[visitor] VISITOR_HASH_SALT is not set; using a fixed dev salt (dev/test only).");
      warned = true;
    }
    salt = DEV_SALT;
  }
  return `${salt}:${now.toISOString().slice(0, 10)}`;
}

export function visitorHash(ip: string, userAgent: string, salt: string): string {
  return createHash("sha256").update(`${ip}\n${userAgent}\n${salt}`).digest("hex");
}
