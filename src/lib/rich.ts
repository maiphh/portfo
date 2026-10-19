/**
 * Tiny inline markup for content strings: `[[Điều]]` marks a Vietnamese legal term,
 * rendered as `<span class="vi" lang="vi">`. Keeps content free of raw HTML.
 */
export type RichPart = { text: string; vi: boolean };

export function parseRich(input: string): RichPart[] {
  const parts: RichPart[] = [];
  const re = /\[\[(.+?)\]\]/g;
  let last = 0;
  for (const m of input.matchAll(re)) {
    const i = m.index;
    if (i > last) parts.push({ text: input.slice(last, i), vi: false });
    parts.push({ text: m[1] ?? "", vi: true });
    last = i + m[0].length;
  }
  if (last < input.length) parts.push({ text: input.slice(last), vi: false });
  return parts;
}

/** Plain-text version (for meta descriptions). */
export const plainRich = (input: string): string => input.replace(/\[\[(.+?)\]\]/g, "$1");
