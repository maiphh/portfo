/** SAMPLE DATA † — GitHub activity until the 6-hourly sync lands in Postgres. */
import { seeded } from "../random";
import type { GithubSummary, HeatLevel } from "../types";

function sampleHeatmap(): HeatLevel[] {
  // Seeded, busier in recent months and quieter on weekends (same recipe as the prototype).
  const r = seeded(29);
  const cells: HeatLevel[] = [];
  for (let w = 0; w < 52; w++) {
    for (let d = 0; d < 7; d++) {
      const x = r() * (0.25 + 0.6 * (w / 51)) * (d >= 5 ? 0.6 : 1);
      cells.push(x < 0.12 ? 0 : x < 0.28 ? 1 : x < 0.42 ? 2 : x < 0.55 ? 3 : 4);
    }
  }
  return cells;
}

/** "Today 13:00 (UTC+7)" relative to the build, so the sample label reads sensibly. */
function sampleSyncTime(now = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(6, 0, 0, 0); // 13:00 in Asia/Ho_Chi_Minh
  return d.toISOString();
}

export const mockGithub: GithubSummary = {
  publicRepos: 24,
  commitsLastYear: 1146,
  streakDays: 38,
  lastSyncedAt: sampleSyncTime(),
  heatmap: sampleHeatmap(),
  feed: [
    { kind: "commit", text: "3 commits to maiphh/portfo", when: "2 hours ago" },
    { kind: "pr", text: "Opened a pull request in maiphh/portfo", when: "yesterday" },
    { kind: "commit", text: "5 commits to maiphh/openportfo", when: "3 days ago" },
    { kind: "star", text: "Starred a repository", when: "4 days ago" },
  ],
};
