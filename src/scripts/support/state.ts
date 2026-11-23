import type { Rail } from "~/lib/support/pricing";
export type Status = {
  id: string;
  rail: Rail;
  status: string;
  amountMinor: number;
  currency: string;
  presetCount: number | null;
  expiresAt: string | null;
  paidAt: string | null;
};
export type Checkout = {
  status: Status;
  checkoutUrl: string | null;
  qrCode: string | null;
  transferNote: string | null;
};
export type Attempt = { id: string; key: string };
