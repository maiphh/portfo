/**
 * Builds data/site.json from the site's real content, so the Worker's tools and the
 * ingest corpus never drift from what the site publishes:
 *   - src/lib/site.ts            name, role, city, email, GitHub
 *   - src/data/experience.json   the CV timeline
 *   - src/content/work/*.md      the case studies (frontmatter + body)
 *
 * Talentnet work is CV level only: these files already are (`confidential: true`), and
 * nothing outside them is read. Open questions (`todo`) are left out because they aren't facts.
 *
 * Run: pnpm corpus (CI fails if the committed file is stale).
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { site } from "../../../src/lib/site.ts";
import type { SiteData } from "../src/data.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = fileURLToPath(new URL("../data/site.json", import.meta.url));

/** `[[Điều]]` marks a Vietnamese legal term on the site; the chat only needs the word. */
const plain = (s: string) => s.replaceAll(/\[\[([^\]]+)\]\]/g, "$1");

interface Front {
  title: string;
  headline: string;
  summary: string;
  org: string;
  meta?: string[];
  period?: string;
  order: number;
  anchor: string;
  steps?: { title: string; body: string }[];
  facts?: { value: string; label: string }[];
  note?: string;
  confidential?: boolean;
  links?: { label: string; href: string }[];
}

interface Exp {
  id: string;
  lane: "work" | "study" | "award";
  title: string;
  detail: string;
  start: string;
  end?: string;
  note?: { lead: string; text: string };
  order: number;
}

function splitFrontmatter(src: string): { front: Front; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
  if (!m) throw new Error("missing frontmatter");
  return { front: parse(m[1] ?? "") as Front, body: (m[2] ?? "").trim() };
}

async function main() {
  const experience = (
    JSON.parse(await readFile(join(root, "src/data/experience.json"), "utf8")) as Exp[]
  ).sort((a, b) => a.order - b.order);
  const roleAt = new Map(
    experience
      .filter((e) => e.lane === "work")
      .map((e) => [e.title.toLowerCase(), e.detail.split(" · ")[0] ?? null]),
  );

  const dir = join(root, "src/content/work");
  const files = (await readdir(dir)).filter((f) => /\.mdx?$/.test(f)).sort();
  const projects = [];
  for (const f of files) {
    const { front, body } = splitFrontmatter(await readFile(join(dir, f), "utf8"));
    const slug = f.replace(/\.mdx?$/, "");
    const org = front.org;
    const role =
      [...roleAt].find(
        ([k]) => k.includes(org.toLowerCase()) || org.toLowerCase().includes(k),
      )?.[1] ?? null;
    projects.push({
      slug,
      title: front.title,
      headline: front.headline,
      oneLiner: plain(front.summary),
      org,
      role,
      period: front.period ?? null,
      tags: front.meta ?? [],
      order: front.order,
      href: `/work/${slug}`,
      homeHref: `/#${front.anchor}`,
      confidential: front.confidential ?? false,
      approach: (front.steps ?? []).map((s) => ({ title: plain(s.title), body: plain(s.body) })),
      outcomes: (front.facts ?? []).map((x) => ({ value: x.value, label: x.label })),
      note: front.note ?? null,
      links: front.links ?? [],
      body: plain(body),
    });
  }
  projects.sort((a, b) => a.order - b.order);

  const data: SiteData = {
    profile: {
      name: site.name,
      role: site.role,
      city: site.city,
      summary: site.description,
    },
    contact: {
      email: site.email,
      github: site.github,
      githubHandle: site.githubHandle,
      contactHref: "/#contact",
      howToReach:
        "Use the contact form on the site or email directly. GitHub is for code, not messages.",
    },
    experience: experience.map((e) => ({
      id: e.id,
      kind: e.lane,
      title: e.title,
      detail: e.detail,
      start: e.start,
      end: e.end ?? null,
      highlight: e.note ? `${e.note.lead}, ${e.note.text}` : null,
    })),
    projects,
  };
  await writeFile(out, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${out}: ${projects.length} projects, ${experience.length} CV entries`);
}

await main();
