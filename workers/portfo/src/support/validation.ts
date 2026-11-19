import { quoteDonation } from "../../../../src/lib/support/pricing";
import type { Rail, Selection } from "../../../../src/lib/support/pricing";

export function validateQuote(rail: unknown, selection: unknown) {
  if (rail !== "payos" && rail !== "polar") return null;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) return null;
  const value = selection as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length !== 1 || !(keys[0] === "preset" || keys[0] === "customAmountMinor")) return null;
  return quoteDonation(rail as Rail, selection as Selection);
}

export function normalizeSupportText(
  value: unknown,
  max: number,
  multiline = false,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n");
  if (
    [...normalized].some((char) => {
      const code = char.charCodeAt(0);
      return (code < 32 && !(multiline && code === 10)) || (code >= 127 && code <= 159);
    })
  )
    return null;
  const text = normalized.trim();
  if (text.length > max || /[<>]|https?:\/\/|www\./i.test(text)) return null;
  return text;
}
