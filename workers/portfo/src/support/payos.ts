import { safeEqual } from "../http";
import { hmacHex } from "./crypto";

/** Matches the PayOS SDK's alphabetic key and array canonicalization. */
export function canonicalizePayos(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => {
      let value = data[key];
      if (Array.isArray(value))
        value = JSON.stringify(
          value.map((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return item;
            const obj = item as Record<string, unknown>;
            return Object.fromEntries(
              Object.keys(obj)
                .sort()
                .map((k) => [k, obj[k]]),
            );
          }),
        );
      if (value === null || value === "null" || value === "undefined") value = "";
      return `${key}=${String(value)}`;
    })
    .join("&");
}

export async function verifyPayosData(
  data: Record<string, unknown>,
  signature: unknown,
  key: string,
): Promise<boolean> {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature) || !key) return false;
  return safeEqual(await hmacHex(key, canonicalizePayos(data)), signature.toLowerCase());
}

export interface PayosCredentials {
  PAYOS_CLIENT_ID?: string;
  PAYOS_API_KEY?: string;
  PAYOS_CHECKSUM_KEY?: string;
}

export interface PayosLinkRequest {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  expiredAt: number;
}

/** Provider rejection and transport ambiguity are distinguishable for safe retry handling. */
export class PayosRequestError extends Error {
  constructor(readonly uncertain: boolean) {
    super("PayOS request failed");
  }
}

export async function createPayosLink(
  env: PayosCredentials,
  request: PayosLinkRequest,
): Promise<Record<string, unknown>> {
  if (!env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY || !env.PAYOS_CHECKSUM_KEY)
    throw new PayosRequestError(true);
  const { amount, cancelUrl, description, orderCode, returnUrl } = request;
  const signature = await hmacHex(
    env.PAYOS_CHECKSUM_KEY,
    canonicalizePayos({ amount, cancelUrl, description, orderCode, returnUrl }),
  );
  let response: Response;
  try {
    response = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": env.PAYOS_CLIENT_ID,
        "x-api-key": env.PAYOS_API_KEY,
      },
      body: JSON.stringify({ ...request, signature }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new PayosRequestError(true);
  }
  if (!response.ok) throw new PayosRequestError(response.status >= 500 || response.status === 429);
  let payload: { code?: unknown; data?: unknown; signature?: unknown };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new PayosRequestError(true);
  }
  if (payload.code !== "00") throw new PayosRequestError(false);
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data))
    throw new PayosRequestError(true);
  const data = payload.data as Record<string, unknown>;
  if (
    !(await verifyPayosData(data, payload.signature, env.PAYOS_CHECKSUM_KEY)) ||
    data.orderCode !== orderCode ||
    data.amount !== amount ||
    data.currency !== "VND" ||
    typeof data.paymentLinkId !== "string" ||
    !data.paymentLinkId ||
    typeof data.qrCode !== "string" ||
    !data.qrCode ||
    typeof data.checkoutUrl !== "string"
  )
    throw new PayosRequestError(true);
  const { isAllowedCheckoutUrl } = await import("./callbacks");
  if (!isAllowedCheckoutUrl(data.checkoutUrl, "payos")) throw new PayosRequestError(true);
  return data;
}

/** Handle a verified delivery; only signed success fields can settle an existing row. */
export async function handlePayosWebhook(
  body: unknown,
  env: PayosCredentials & { DB: D1Database },
): Promise<number> {
  if (!env.PAYOS_CHECKSUM_KEY) return 503;
  if (!body || typeof body !== "object" || Array.isArray(body)) return 400;
  const payload = body as Record<string, unknown>;
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) return 400;
  const data = payload.data as Record<string, unknown>;
  if (!(await verifyPayosData(data, payload.signature, env.PAYOS_CHECKSUM_KEY))) return 403;
  if (payload.code !== "00" || payload.success !== true || data.code !== "00") return 200;
  if (
    !Number.isSafeInteger(data.orderCode) ||
    !Number.isSafeInteger(data.amount) ||
    data.currency !== "VND" ||
    typeof data.paymentLinkId !== "string" ||
    !data.paymentLinkId ||
    typeof data.reference !== "string" ||
    !data.reference
  )
    return 200;
  try {
    const row = await env.DB.prepare(
      "SELECT id FROM support_donations WHERE rail = 'payos' AND payos_order_code = ?",
    )
      .bind(data.orderCode)
      .first<{ id: string }>();
    if (!row) return 200;
    const { sha256Hex } = await import("../http");
    const { applyPaymentEvidence } = await import("./store");
    await applyPaymentEvidence(env.DB, {
      rail: "payos",
      eventId: await sha256Hex(canonicalizePayos(data)),
      donationId: row.id,
      amountMinor: data.amount as number,
      currency: "VND",
      providerReference: data.reference,
      payosLinkId: data.paymentLinkId,
      observedAt: new Date().toISOString(),
    });
    return 200;
  } catch {
    return 503;
  }
}
