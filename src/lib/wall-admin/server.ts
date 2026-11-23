import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { APIContext, AstroGlobal } from "astro";
import { getSecret } from "astro:env/server";
import { workerOrigin } from "~/lib/api";

export const COOKIE = "portfo_owner";
export const SESSION_AGE = 8 * 60 * 60;
export const TOKEN = /^[a-f0-9]{64}$/;

export class GatewayError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Context = Pick<APIContext, "cookies" | "clientAddress">;

export function privatePage(page: AstroGlobal) {
  page.response.headers.set("Cache-Control", "no-store");
  page.response.headers.set("X-Robots-Tag", "noindex");
}

export function digest(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export async function worker(
  context: Context,
  path: string,
  options: { method?: string; body?: Record<string, unknown> | FormData; client?: boolean } = {},
) {
  const service = getSecret("WALL_ADMIN_SERVICE_KEY");
  const origin = workerOrigin(
    getSecret("WALL_ADMIN_WORKER_URL") || import.meta.env.PUBLIC_WORKER_URL,
  );
  if (!service || !origin) throw new GatewayError(503, "The wall service is not configured.");
  const headers = new Headers({ "X-Wall-Service": service });
  const token = context.cookies.get(COOKIE)?.value ?? "";
  if (TOKEN.test(token)) headers.set("X-Wall-Session", digest(token));
  if (options.client) {
    // Astro's dev server sets the socket address. Vercel's Astro adapter uses
    // the platform's overwritten x-forwarded-for header.
    let address = "";
    try {
      address = context.clientAddress;
    } catch {
      // Requests without a platform address share one quota bucket.
    }
    if (isIP(address)) headers.set("X-Wall-Client", address);
  }
  const { body } = options;
  if (body && !(body instanceof FormData)) headers.set("Content-Type", "application/json");
  try {
    return await fetch(`${origin}/internal/wall-admin${path}`, {
      method: options.method,
      headers,
      body: body instanceof FormData ? body : body && JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new GatewayError(503, "The wall service is temporarily unavailable. Please retry.");
  }
}

export async function ownerSession(
  context: Context,
): Promise<"signed-in" | "signed-out" | "unavailable"> {
  if (!TOKEN.test(context.cookies.get(COOKIE)?.value ?? "")) return "signed-out";
  try {
    const response = await worker(context, "/session");
    if (response.ok) return "signed-in";
    if (response.status === 401) return "signed-out";
  } catch {
    // Report a service outage without discarding a potentially valid session.
  }
  return "unavailable";
}

export function response(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function forward(upstream: Response) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  for (const name of ["Content-Type", "Retry-After", "X-Content-Type-Options"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export function gatewayFailure(error: unknown) {
  return error instanceof GatewayError
    ? response({ error: error.message }, error.status)
    : response({ error: "The wall service is temporarily unavailable. Please retry." }, 503);
}

export function ownerRedirect(path: string) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: path,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
