/**
 * Sends the corpus (from data/site.json, see scripts/corpus.ts) to POST /ingest.
 *
 *   CHAT_URL=https://portfo-chat.<account>.workers.dev INGEST_SECRET=... pnpm ingest
 *   pnpm ingest --dry-run      # print the documents, send nothing
 *
 * Documents: one profile, one CV, one per case study. Only what the site publishes;
 * Talentnet case studies are CV-level already.
 */
import { readFile } from "node:fs/promises";
import type { SiteData } from "../src/data.ts";

const data = JSON.parse(
  await readFile(new URL("../data/site.json", import.meta.url), "utf8"),
) as SiteData;

export function buildDocuments(d: SiteData) {
  const cv = d.experience
    .map((e) => [`${e.title} (${e.kind}): ${e.detail}.`, e.highlight].filter(Boolean).join(" "))
    .join("\n\n");
  return [
    {
      id: "profile",
      title: d.profile.name,
      href: "/",
      source: "profile",
      text: `${d.profile.summary}\n\n${d.profile.name} is an ${d.profile.role} based in ${d.profile.city}. Email: ${d.contact.email}. GitHub: ${d.contact.github}.`,
    },
    { id: "cv", title: "Experience", href: "/#timeline", source: "cv", text: cv },
    ...d.projects.map((p) => ({
      id: p.slug,
      title: p.title,
      href: p.href,
      source: "case_study",
      text: [
        `${p.title}: ${p.headline}`,
        p.oneLiner,
        `Organisation: ${p.org}${p.period ? ` (${p.period})` : ""}. Tags: ${p.tags.join(", ")}.`,
        p.approach.length
          ? `How it works: ${p.approach.map((s) => `${s.title}. ${s.body}`).join(" ")}`
          : "",
        p.outcomes.length
          ? `Results: ${p.outcomes.map((o) => `${o.value} ${o.label}`).join("; ")}.`
          : "",
        p.body,
      ]
        .filter(Boolean)
        .join("\n\n"),
    })),
  ];
}

const documents = buildDocuments(data);

if (process.argv.includes("--dry-run")) {
  for (const doc of documents)
    console.log(`${doc.id.padEnd(14)} ${doc.href.padEnd(20)} ${doc.text.length} chars`);
  process.exit(0);
}

const url = process.env.CHAT_URL;
const secret = process.env.INGEST_SECRET;
if (!url || !secret) {
  console.error("Set CHAT_URL and INGEST_SECRET (or use --dry-run).");
  process.exit(1);
}
const res = await fetch(`${url.replace(/\/$/, "")}/ingest`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ documents }),
});
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
