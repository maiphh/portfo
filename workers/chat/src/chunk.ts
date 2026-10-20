/** Paragraph-aware chunking: packs paragraphs up to `size` chars, with a small overlap. */
export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const paras = text
    .replaceAll("\r\n", "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replaceAll(/\s+/g, " ").trim())
    .filter(Boolean);
  const pieces: string[] = [];
  for (const p of paras) {
    if (p.length <= size) pieces.push(p);
    else for (let i = 0; i < p.length; i += size - overlap) pieces.push(p.slice(i, i + size));
  }
  const chunks: string[] = [];
  let cur = "";
  for (const p of pieces) {
    if (cur && cur.length + p.length + 1 > size) {
      chunks.push(cur);
      const tail = cur.slice(-overlap);
      const cut = tail.indexOf(" ");
      cur = `${cut >= 0 ? tail.slice(cut + 1) : tail} ${p}`.trim();
    } else cur = cur ? `${cur}\n${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
