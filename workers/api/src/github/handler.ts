/** POST /cron/github-sync: Bearer CRON_SECRET, then one sync run. */
import type { Env } from "../env";
import { safeEqual } from "../http";
import { runGithubSync, type SyncDeps } from "./sync";

export async function isAuthorized(header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  return safeEqual(header, `Bearer ${secret}`);
}

export async function handleGithubSync(
  request: Request,
  env: Env,
  deps: () => SyncDeps,
): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  const secret = env.CRON_SECRET;
  if (!secret) {
    return Response.json({ ok: false, error: "cron_not_configured" }, { status: 503, headers });
  }
  if (!(await isAuthorized(request.headers.get("authorization"), secret))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }
  const result = await runGithubSync(deps());
  if (result.ok) return Response.json(result, { headers });
  const status =
    result.error === "already_running" ? 409 : result.error === "github_token_missing" ? 503 : 502;
  return Response.json(result, { status, headers });
}
