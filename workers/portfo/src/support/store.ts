import type { Rail, Currency } from "../../../../src/lib/support/pricing";

export interface DonationReservation {
  id: string;
  receiptKeyHash: string;
  fingerprint: string;
  rail: Rail;
  currency: Currency;
  amountMinor: number;
  presetCount: number | null;
  displayName: string | null;
  privateMessage: string | null;
  createdAt: string;
  payosOrderCode: number | null;
}

/** Returns false on an ID or order-code collision; the caller decides whether to retry. */
export async function reserveDonation(
  db: D1Database,
  donation: DonationReservation,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO support_donations
    (id, receipt_key_hash, request_fingerprint, rail, currency, amount_minor, preset_count,
     display_name, private_message, status, created_at, updated_at, payos_order_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(
      donation.id,
      donation.receiptKeyHash,
      donation.fingerprint,
      donation.rail,
      donation.currency,
      donation.amountMinor,
      donation.presetCount,
      donation.displayName,
      donation.privateMessage,
      donation.createdAt,
      donation.createdAt,
      donation.payosOrderCode,
    )
    .run();
  return result.meta.changes === 1;
}

export interface PaymentEvidence {
  rail: Rail;
  eventId: string;
  donationId: string;
  amountMinor: number;
  currency: Currency;
  providerReference: string;
  payosLinkId?: string;
  polarCheckoutId?: string;
  observedAt: string;
}

/** Atomically records delivery and applies matching evidence. A failed batch is retryable. */
export async function applyPaymentEvidence(
  db: D1Database,
  evidence: PaymentEvidence,
): Promise<void> {
  const {
    rail,
    eventId,
    donationId,
    amountMinor,
    currency,
    providerReference,
    payosLinkId,
    polarCheckoutId,
    observedAt,
  } = evidence;
  await db.batch([
    db
      .prepare(
        `INSERT INTO support_webhook_events (rail, event_id, donation_id, received_at, outcome)
      SELECT ?, ?, id, ?, CASE WHEN rail = ? AND amount_minor = ? AND currency = ?
        AND (? IS NULL OR payos_link_id IS NULL OR payos_link_id = ?)
        AND (? IS NULL OR polar_checkout_id = ?)
        AND NOT EXISTS (SELECT 1 FROM support_donations other WHERE other.rail = ? AND other.provider_payment_ref = ? AND other.id <> support_donations.id)
        THEN 'applied' ELSE 'mismatch' END
      FROM support_donations WHERE id = ? ON CONFLICT(rail, event_id) DO NOTHING`,
      )
      .bind(
        rail,
        eventId,
        observedAt,
        rail,
        amountMinor,
        currency,
        payosLinkId ?? null,
        payosLinkId ?? null,
        polarCheckoutId ?? null,
        polarCheckoutId ?? null,
        rail,
        providerReference,
        donationId,
      ),
    db
      .prepare(
        `UPDATE support_donations SET status = 'paid', paid_at = COALESCE(paid_at, ?), updated_at = ?,
      provider_payment_ref = COALESCE(provider_payment_ref, ?), payos_link_id = COALESCE(payos_link_id, ?),
      checkout_url = NULL, qr_code = NULL
      WHERE id = ? AND rail = ? AND amount_minor = ? AND currency = ?
      AND (provider_payment_ref IS NULL OR provider_payment_ref = ?)
      AND (? IS NULL OR payos_link_id IS NULL OR payos_link_id = ?)
      AND (? IS NULL OR polar_checkout_id = ?)
      AND EXISTS (SELECT 1 FROM support_webhook_events WHERE rail = ? AND event_id = ? AND donation_id = ? AND outcome = 'applied')`,
      )
      .bind(
        observedAt,
        observedAt,
        providerReference,
        payosLinkId ?? null,
        donationId,
        rail,
        amountMinor,
        currency,
        providerReference,
        payosLinkId ?? null,
        payosLinkId ?? null,
        polarCheckoutId ?? null,
        polarCheckoutId ?? null,
        rail,
        eventId,
        donationId,
      ),
  ]);
}
