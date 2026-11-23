import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const enabled = process.env.PUBLIC_SUPPORT_ENABLED === "true";
const sitemap = readFileSync("dist/client/sitemap-0.xml", "utf8");
for (const path of ["buy-me-claude", "buy-me-claude/return"]) {
  const html = readFileSync(`dist/client/${path}/index.html`, "utf8");
  const listed = new RegExp(`/${path}/?(?:<|$)`).test(sitemap);
  const noindex = /<meta name="robots" content="noindex"/.test(html);
  assert.equal(listed, enabled, `${path}: sitemap visibility`);
  assert.equal(noindex, !enabled, `${path}: robots visibility`);
}
console.log(`Support visibility verified (enabled: ${enabled}).`);
