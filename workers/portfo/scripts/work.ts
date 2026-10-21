/**
 * Builds data/work.json from case-study frontmatter (title only), so /popular and /view
 * know the slug list without importing Astro.
 *
 *   - src/content/work/*.{md,mdx}
 *
 * Run: pnpm work (CI fails if the committed file is stale).
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = fileURLToPath(new URL("../data/work.json", import.meta.url));

interface Front {
  title: string;
  order: number;
}

function splitFrontmatter(src: string): Front {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) throw new Error("missing frontmatter");
  return parse(m[1] ?? "") as Front;
}

async function main() {
  const dir = join(root, "src/content/work");
  const files = (await readdir(dir)).filter((f) => /\.mdx?$/.test(f)).sort();
  const items = [];
  for (const f of files) {
    const front = splitFrontmatter(await readFile(join(dir, f), "utf8"));
    const slug = f.replace(/\.mdx?$/, "");
    items.push({
      slug,
      title: front.title,
      href: `/work/${slug}`,
      order: front.order,
    });
  }
  items.sort((a, b) => a.order - b.order);
  const data = items.map(({ slug, title, href }) => ({ slug, title, href }));
  await writeFile(out, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote ${out}: ${data.length} case studies`);
}

await main();
