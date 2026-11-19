import { safeEqual } from "../http";
import { hmacSha256 } from "./crypto";

/** Verify Standard Webhooks over the unmodified request body, before parsing JSON. */
export async function verifyPolarWebhook(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (
    !id ||
    !timestamp ||
    !signatures ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  try {
    const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const key = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    if (!key.length) return false;
    const signature = btoa(
      String.fromCharCode(...(await hmacSha256(key, `${id}.${timestamp}.${body}`))),
    );
    for (const candidate of signatures.split(/\s+/)) {
      if (candidate.startsWith("v1,") && (await safeEqual(signature, candidate.slice(3))))
        return true;
    }
    return false;
  } catch {
    return false;
  }
}

import type { Env } from "../env";
import { isAllowedCheckoutUrl } from "./callbacks";
import { applyPaymentEvidence } from "./store";

export class PolarRequestError extends Error {
  constructor(readonly uncertain: boolean) {
    super("Polar request failed");
  }
}
const apiOrigin = (env: Env) =>
  env.POLAR_ENVIRONMENT === "sandbox"
    ? "https://sandbox-api.polar.sh"
    : env.POLAR_ENVIRONMENT === "production"
      ? "https://api.polar.sh"
      : null;
async function polarRequest(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const origin = apiOrigin(env);
  if (!origin || !env.POLAR_ACCESS_TOKEN || !env.POLAR_ORG_ID || !env.POLAR_PRODUCT_ID)
    throw new PolarRequestError(true);
  let response: Response;
  try {
    response = await fetch(origin + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Polar-Version": "2026-10",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new PolarRequestError(true);
  }
  if (!response.ok) throw new PolarRequestError(response.status >= 500 || response.status === 429);
  try {
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new PolarRequestError(true);
  }
}
type PolarExpected = { id: string; amountMinor: number; checkoutId?: string };
export function matchesPolarCheckout(
  data: Record<string, unknown>,
  env: Env,
  expected: PolarExpected,
): boolean {
  const metadata = data.metadata as Record<string, unknown> | null;
  const product = data.product as Record<string, unknown> | null;
  return (
    typeof data.id === "string" &&
    !!data.id &&
    (!expected.checkoutId || data.id === expected.checkoutId) &&
    product?.organization_id === env.POLAR_ORG_ID &&
    data.product_id === env.POLAR_PRODUCT_ID &&
    metadata?.donation_id === expected.id &&
    data.currency === "usd" &&
    data.amount === expected.amountMinor &&
    (data.discount_amount === 0 || data.discount_amount == null)
  );
}
export async function createPolarCheckout(
  env: Env,
  expected: PolarExpected,
  successUrl: string,
  cancelUrl: string,
) {
  if (!env.POLAR_PRODUCT_ID) throw new PolarRequestError(true);
  const data = await polarRequest(env, "/v1/checkouts/", {
    method: "POST",
    body: JSON.stringify({
      products: [env.POLAR_PRODUCT_ID],
      prices: {
        [env.POLAR_PRODUCT_ID]: [
          { amount_type: "fixed", price_amount: expected.amountMinor, price_currency: "usd" },
        ],
      },
      metadata: { donation_id: expected.id },
      allow_discount_codes: false,
      success_url: successUrl,
      return_url: cancelUrl,
    }),
  });
  if (
    !matchesPolarCheckout(data, env, expected) ||
    typeof data.url !== "string" ||
    !isAllowedCheckoutUrl(data.url, "polar", env.POLAR_ENVIRONMENT)
  )
    throw new PolarRequestError(true);
  return data;
}
export async function fetchPolarCheckout(env: Env, id: string) {
  return polarRequest(env, `/v1/checkouts/${encodeURIComponent(id)}`);
}
export async function handlePolarWebhook(raw: string, headers: Headers, env: Env): Promise<number> {
  if (!env.POLAR_WEBHOOK_SECRET) return 503;
  if (!(await verifyPolarWebhook(raw, headers, env.POLAR_WEBHOOK_SECRET))) return 403;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return 400;
  } catch {
    return 400;
  }
  if (payload.type !== "order.paid") return 200;
  if (payload.api_version !== "2026-10") return 400;
  const order = payload.data as Record<string, unknown> | undefined;
  if (!order || typeof order !== "object") return 400;
  if (
    order.status !== "paid" ||
    typeof order.id !== "string" ||
    typeof order.checkout_id !== "string"
  )
    return 200;
  try {
    const metadata = order.metadata as Record<string, unknown> | undefined;
    const row = await env.DB.prepare(
      "SELECT id, amount_minor, polar_checkout_id FROM support_donations WHERE rail = 'polar' AND (id = ? OR polar_checkout_id = ?)",
    )
      .bind(
        typeof metadata?.donation_id === "string" ? metadata.donation_id : "",
        order.checkout_id,
      )
      .first<{ id: string; amount_minor: number; polar_checkout_id: string | null }>();
    if (!row || (row.polar_checkout_id && row.polar_checkout_id !== order.checkout_id)) return 200;
    if (metadata?.donation_id != null && metadata.donation_id !== row.id) return 200;
    const product = order.product as Record<string, unknown> | null;
    if (
      order.paid !== true ||
      (product?.organization_id != null && product.organization_id !== env.POLAR_ORG_ID) ||
      order.product_id !== env.POLAR_PRODUCT_ID ||
      order.currency !== "usd" ||
      order.subtotal_amount !== row.amount_minor ||
      order.net_amount !== row.amount_minor ||
      order.discount_amount !== 0
    )
      return 200;
    if (
      !row.polar_checkout_id ||
      metadata?.donation_id == null ||
      product?.organization_id == null
    ) {
      const remote = await fetchPolarCheckout(env, order.checkout_id as string);
      if (
        !matchesPolarCheckout(remote, env, {
          id: row.id,
          amountMinor: row.amount_minor,
          checkoutId: order.checkout_id as string,
        })
      )
        return 200;
      await env.DB.prepare(
        "UPDATE support_donations SET polar_checkout_id = ? WHERE id = ? AND polar_checkout_id IS NULL",
      )
        .bind(order.checkout_id, row.id)
        .run();
    }
    await applyPaymentEvidence(env.DB, {
      rail: "polar",
      eventId: headers.get("webhook-id") ?? "",
      donationId: row.id,
      amountMinor: row.amount_minor,
      currency: "USD",
      providerReference: order.checkout_id as string,
      polarCheckoutId: order.checkout_id as string,
      observedAt: new Date().toISOString(),
    });
    return 200;
  } catch {
    return 503;
  }
}
