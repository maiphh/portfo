/**
 * Data contracts for the backend features. The mock modules in `src/lib/mocks/`
 * implement these today; the portfo-api Worker returns the same shapes.
 */

/** One row of the "Most read this week" list (GET /popular). */
export interface ViewCount {
  slug: string;
  title: string;
  /** Case-study page, e.g. "/work/document-ocr". */
  href: string;
  views: number;
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface GithubFeedItem {
  kind: "commit" | "pr" | "issue" | "star";
  text: string;
  /** Human label, e.g. "2 hours ago". */
  when: string;
}

/** A repository as returned by /activity (public, non-fork, non-archived). */
export interface GithubRepoSummary {
  name: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  topics: string[];
  /** ISO 8601, or null for an empty repo. */
  pushedAt: string | null;
}

/** Synced every 6 hours into D1 by the portfo-api Cron Trigger. */
export interface GithubSummary {
  publicRepos: number;
  commitsLastYear: number;
  streakDays: number;
  /** ISO 8601 timestamp of the last successful sync. */
  lastSyncedAt: string;
  /** 52 weeks × 7 days, week-major, oldest first (live data: Sunday→Saturday columns). */
  heatmap: HeatLevel[];
  feed: GithubFeedItem[];
}

export type ContactRole = "recruiter" | "client" | "other";

export interface ContactInput {
  name: string;
  email: string;
  role?: ContactRole;
  message: string;
}
