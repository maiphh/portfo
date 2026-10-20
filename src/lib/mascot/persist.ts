/** Floated mascot corner, kept in sessionStorage so it survives full-page navigations. */
import type { CornerId } from "./corners";

export const STORAGE_KEY = "portfo-mascot:v1";
const CORNERS = new Set<string>(["tl", "tr", "bl", "br"]);

function getStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function loadCorner(store: Storage | null = getStorage()): CornerId | null {
  if (!store) return null;
  try {
    const raw: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return null;
    const corner = (raw as { corner?: unknown }).corner;
    return typeof corner === "string" && CORNERS.has(corner) ? (corner as CornerId) : null;
  } catch {
    return null;
  }
}

export function saveCorner(corner: CornerId, store: Storage | null = getStorage()): void {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ corner }));
  } catch {
    /* quota or blocked storage */
  }
}
