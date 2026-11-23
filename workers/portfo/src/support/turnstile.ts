/** Fail closed if Siteverify fails or its claims do not match the configured site. */
export async function verifyTurnstile(
  token: string,
  secret: string,
  origin: string,
  action: "support_pay" | "support_review",
): Promise<boolean> {
  if (!token || !secret) return false;
  try {
    const hostname = new URL(origin).hostname;
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    return data.success === true && data.hostname === hostname && data.action === action;
  } catch {
    return false;
  }
}
