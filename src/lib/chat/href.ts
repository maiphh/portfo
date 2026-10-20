/**
 * Source links come from the model's tools, so treat them as untrusted: only http(s) and
 * site-relative links survive. Same-origin links come back as a path.
 */
export function safeHref(href: string, origin = "https://maigiaphu.invalid"): string | null {
  const raw = href.trim();
  if (!raw || raw.length > 500) return null;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.origin === new URL(origin).origin) return `${url.pathname}${url.search}${url.hash}`;
  return url.href;
}
