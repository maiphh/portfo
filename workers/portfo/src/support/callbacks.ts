import type { Rail } from "../../../../src/lib/support/pricing";

/** Build callbacks from the configured canonical origin, never a request header. */
export function buildSupportCallbacks(origin: string, id: string, rail: Rail) {
  const base = new URL(origin);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    (base.protocol !== "https:" && !(base.protocol === "http:" && loopback)) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  ) {
    throw new Error("Invalid support origin");
  }
  const callback = (hint: string) => {
    const url = new URL("/buy-me-claude/return", base);
    url.searchParams.set("id", id);
    url.searchParams.set("rail", rail);
    url.searchParams.set("hint", hint);
    if (rail === "polar" && hint === "success")
      url.searchParams.set("checkout_id", "{CHECKOUT_ID}");
    return url.toString().replace("%7BCHECKOUT_ID%7D", "{CHECKOUT_ID}");
  };
  return { returnUrl: callback("success"), cancelUrl: callback("cancel") };
}

export function isAllowedCheckoutUrl(value: string, rail: Rail, environment?: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (rail === "payos") return url.hostname === "pay.payos.vn";
    if (environment === "sandbox") return url.hostname === "sandbox.polar.sh";
    if (environment === "production") return url.hostname === "polar.sh";
    return false;
  } catch {
    return false;
  }
}
