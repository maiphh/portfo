/**
 * visitor_hash = SHA-256(IP + UA + daily salt). No cookies and no raw IPs are stored.
 * The daily salt is VISITOR_HASH_SALT combined with the calendar day in Asia/Ho_Chi_Minh.
 */
import { ConfigError, isProduction, type Env, type Logger } from "./env";
import { sha256Hex } from "./http";

const DEV_SALT = "portfo-dev-salt";

export const SITE_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** YYYY-MM-DD of `now` in Asia/Ho_Chi_Minh. */
export function localDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SITE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

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
  return `${salt}:${localDay(now)}`;
}

export async function visitorHash(ip: string, userAgent: string, salt: string): Promise<string> {
  return sha256Hex(`${ip}\n${userAgent}\n${salt}`);
}
