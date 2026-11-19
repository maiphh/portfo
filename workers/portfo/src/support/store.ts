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
