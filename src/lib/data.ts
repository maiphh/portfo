/**
 * Data access for backend-fed sections, at build time. Returns labelled sample data
 * while USE_MOCKS is on and null otherwise (the browser then loads from portfo).
 */
import type { CollectionEntry } from "astro:content";
import { USE_MOCKS } from "./flags";
import { mockGithub } from "./mocks/github";
import { mockViews } from "./mocks/views";
import type { GithubSummary, ViewCount } from "./types";

export function getViewCounts(): Record<string, number> {
  return USE_MOCKS ? { ...mockViews } : {};
}

export function getMostRead(work: CollectionEntry<"work">[]): ViewCount[] | null {
  if (!USE_MOCKS) return null;
  return work
    .map((w) => ({
      slug: w.id,
      title: w.data.title,
      href: w.data.page ? `/work/${w.id}` : `/#${w.data.anchor}`,
      views: mockViews[w.id] ?? 0,
    }))
    .sort((a, b) => b.views - a.views);
}

export function getGithubSummary(): GithubSummary | null {
  return USE_MOCKS ? mockGithub : null;
}
