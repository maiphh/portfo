/**
 * The one sample citation the Legal RAG page shows (signature, highlight, flow details).
 * Generic on purpose: no real decree number. To show a real one later, change it here only.
 */
export const EXAMPLE = {
  /** Document number, as the "Số:" line of a decree would carry it. */
  docNo: "xx/2025/NĐ-CP",
  article: "Điều 1",
  articleTitle: "Phạm vi điều chỉnh",
  clause: "Khoản 2",
  point: "Điểm a",
} as const;

/** The HTML path's chunk prefix: `[Số: … > Điều N. Title]`. */
export const examplePrefix = `[Số: ${EXAMPLE.docNo} > ${EXAMPLE.article}. ${EXAMPLE.articleTitle}]`;
