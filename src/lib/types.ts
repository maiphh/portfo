/**
 * Data contracts for the backend features. The mock modules in `src/lib/mocks/`
 * implement these today; the real /api routes will return the same shapes.
 */

/** One row of the "Most read this week" list (GET /api/popular). */
export interface ViewCount {
  slug: string;
  title: string;
  /** In-page anchor on the home page, e.g. "#work-ocr". */
  href: string;
  views: number;
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface GithubFeedItem {
  kind: "commit" | "pr" | "star";
  text: string;
  /** Human label, e.g. "2 hours ago". */
  when: string;
}

/** Synced every 6 hours into Postgres by GitHub Actions. */
export interface GithubSummary {
  publicRepos: number;
  commitsLastYear: number;
  streakDays: number;
  /** ISO 8601 timestamp of the last successful sync. */
  lastSyncedAt: string;
  /** 52 weeks × 7 days, week-major, oldest first. */
  heatmap: HeatLevel[];
  feed: GithubFeedItem[];
}

export interface AskPassage {
  /** e.g. "cv · Talentnet" */
  source: string;
  /** Trusted, repo-authored HTML (may contain `<span lang="vi">`). */
  html: string;
}

export interface AskCitation {
  label: string;
  href: string;
}

/** Answer from POST /api/chat (streamed in the real version). */
export interface AskAnswer {
  passages: AskPassage[];
  /** Trusted, repo-authored HTML. */
  html: string;
  citations: AskCitation[];
}

export type ContactRole = "recruiter" | "client" | "other";
export type ContactCategory = ContactRole | "spam";

export interface ContactInput {
  name: string;
  email: string;
  role?: ContactRole;
  message: string;
}

/** The four states a contact job moves through. */
export type QueueStep = "queued" | "claimed" | "sorted" | "sent";

export interface ContactReceipt {
  jobId: string;
  category: ContactCategory;
}
