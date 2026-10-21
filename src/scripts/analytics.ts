/**
 * Page-view beacons to the portfo-api Worker. Only with PUBLIC_USE_MOCKS=false and
 * PUBLIC_API_URL set; no cookies, no IDs. The Worker dedupes per visitor, page and day.
 * Skipped when the browser sends Do Not Track or Global Privacy Control.
 * Uses fetch + keepalive (not sendBeacon): cross-origin JSON beacons are unreliable.
 */
import { API_MOCK, apiUrl } from "~/lib/api";

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

function referrerHost(): string | undefined {
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : "";
    return host && host !== location.hostname ? host : undefined;
  } catch {
    return undefined;
  }
}

const sent = new Set<string>();

export function sendView(slug: string): void {
  if (API_MOCK || optedOut() || sent.has(slug)) return;
  sent.add(slug);
  const ref = referrerHost();
  const body = JSON.stringify(ref ? { slug, referrer_host: ref } : { slug });
  void fetch(apiUrl("/view"), {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => undefined);
}

/** Case-study page: one view on load. */
export function trackPageView(): void {
  const slug = document.querySelector<HTMLElement>("[data-view-slug]")?.dataset.viewSlug;
  if (slug) sendView(slug);
}

/**
 * Home: a project section counts once it reaches the middle of the screen (the band between
 * 40% and 60% of the viewport), which also works for sections taller than the screen.
 */
export function trackSections(): void {
  if (API_MOCK || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const slug = (e.target as HTMLElement).dataset.slug;
        if (e.isIntersecting && slug) {
          sendView(slug);
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: "-40% 0px -40% 0px" },
  );
  document.querySelectorAll<HTMLElement>("[data-slug]").forEach((el) => io.observe(el));
}
