/**
 * Live GitHub activity (PUBLIC_USE_MOCKS=false + PUBLIC_API_URL): fills the Activity
 * section from the portfo-api Worker. Shows an honest status line when nothing is synced
 * or the API is down / unset.
 */
import { API_URL, apiUrl } from "~/lib/api";
import type { GithubSummary } from "~/lib/types";
import { $, esc, fmt } from "./dom";

const ICONS = { commit: "commit", pr: "pr", issue: "issue", star: "star" } as const;

function syncLabel(iso: string): string {
  const tz = "Asia/Ho_Chi_Minh";
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(d);
  const date =
    day(d) === day(new Date())
      ? "today"
      : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz }).format(
          d,
        );
  return `Synced every 6 hours · last sync ${date} ${time} (UTC+7)`;
}

export function render(root: HTMLElement, s: GithubSummary): void {
  const handle = esc(root.dataset.handle ?? "");
  const line = $("[data-gh-line]", root);
  if (line) {
    line.innerHTML =
      `From <a href="https://github.com/${handle}">github.com/${handle}</a>: ` +
      `<b class="num">${fmt(s.publicRepos)}</b> public repos, ` +
      `<b class="num">${fmt(s.commitsLastYear)} commits</b> in the last year, and a ` +
      `<b class="num">${fmt(s.streakDays)}</b>-day streak.`;
  }
  const hm = $("[data-gh-heatmap]", root);
  if (hm)
    hm.innerHTML = s.heatmap.map((lv) => (lv ? `<i class="l${lv}"></i>` : "<i></i>")).join("");
  const sync = $("[data-gh-sync]", root);
  if (sync) sync.textContent = syncLabel(s.lastSyncedAt);
  const feed = $("[data-gh-feed]", root);
  if (feed) {
    feed.innerHTML = s.feed.length
      ? s.feed
          .map(
            (f) =>
              `<li><svg class="icon" aria-hidden="true"><use href="#i-${ICONS[f.kind]}"></use></svg><b>${esc(f.text)}</b><span>${esc(f.when)}</span></li>`,
          )
          .join("")
      : `<li class="feed-none"><b>No public activity in the last two weeks.</b></li>`;
  }
  const body = $("[data-gh-body]", root);
  const status = $("[data-gh-status]", root);
  if (body) body.hidden = false;
  if (status) status.hidden = true;
}

export async function initActivity(): Promise<void> {
  const root = $("[data-gh-live]");
  const status = $("[data-gh-status]");
  if (!root || !status) return;
  if (!API_URL) {
    status.textContent = "Recent activity appears here once the GitHub sync is connected.";
    return;
  }
  status.textContent = "Loading recent activity…";
  try {
    const res = await fetch(apiUrl("/activity"), { headers: { Accept: "application/json" } });
    const data = (await res.json().catch(() => null)) as
      { status: "ok"; summary: GithubSummary } | { status: "empty" | "unavailable" } | null;
    if (res.ok && data?.status === "ok") return render(root, data.summary);
    status.textContent =
      res.ok && data?.status === "empty"
        ? "No GitHub activity synced yet. The sync runs every 6 hours."
        : "Recent activity appears here once the GitHub sync is connected.";
  } catch {
    status.textContent = "Recent activity appears here once the GitHub sync is connected.";
  }
}
