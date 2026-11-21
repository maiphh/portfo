export type Rail = "payos" | "polar";
export type Currency = "VND" | "USD";
export type Selection = { preset: 1 | 3 | 5 } | { customAmountMinor: number };

export const PRICING = {
  payos: { currency: "VND", unit: 25000, min: 10000, max: 20000000, step: 1000 },
  polar: { currency: "USD", unit: 300, min: 200, max: 50000, step: 100 },
} as const;

export function defaultRailForCountry(
  country: string | null | undefined,
  cardEnabled = false,
): Rail {
  if (!cardEnabled) return "payos";
  return country?.trim().toUpperCase() === "VN" ? "payos" : "polar";
}

export function quoteDonation(rail: Rail, selection: Selection) {
  const price = PRICING[rail];
  if (!price || !selection || typeof selection !== "object") return null;
  if ("preset" in selection) {
    if (![1, 3, 5].includes(selection.preset)) return null;
    return {
      currency: price.currency,
      amountMinor: price.unit * selection.preset,
      presetCount: selection.preset,
    };
  }
  const amount = selection.customAmountMinor;
  if (
    !Number.isSafeInteger(amount) ||
    amount < price.min ||
    amount > price.max ||
    amount % price.step !== 0
  )
    return null;
  return { currency: price.currency, amountMinor: amount, presetCount: null };
}
