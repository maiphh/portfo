/**
 * Light tidy-up of model text before it goes into textContent: drop Markdown emphasis and
 * code markers, turn list stars into bullets. Never produces markup.
 */
export function tidy(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^[ \t]*[*-][ \t]+/gm, "• ")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,6}[ \t]+/gm, "");
}
