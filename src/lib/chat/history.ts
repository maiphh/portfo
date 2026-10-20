/** Chat history and the Worker session token, kept in sessionStorage only. */
import { safeHref } from "./href";
import type { Source } from "./sse";
import { MAX_HISTORY_MESSAGES, type WireMessage } from "./client";

export const STORAGE_KEY = "portfo-chat:v1";
const MAX_STORED = 40;

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  /** Failed turns are shown but never sent back to the model. */
  error?: boolean;
}

export interface ChatSession {
  token: string;
  expiresAt: number;
}

export interface StoredChat {
  messages: StoredMessage[];
  session: ChatSession | null;
}

const empty = (): StoredChat => ({ messages: [], session: null });

function getStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // blocked storage (privacy modes) just means no history
  }
}

export function loadChat(store: Storage | null = getStorage()): StoredChat {
  if (!store) return empty();
  try {
    const raw: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return empty();
    const r = raw as { messages?: unknown; session?: unknown };
    const messages: StoredMessage[] = [];
    for (const m of Array.isArray(r.messages) ? r.messages : []) {
      if (!m || typeof m !== "object") continue;
      const { role, content, sources, error } = m as Record<string, unknown>;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
      const msg: StoredMessage = { role, content };
      if (Array.isArray(sources))
        msg.sources = sources.flatMap((s: unknown) => {
          const { title, href } = (s ?? {}) as Record<string, unknown>;
          const safe = typeof href === "string" ? safeHref(href) : null;
          return typeof title === "string" && safe ? [{ title, href: safe }] : [];
        });
      if (error === true) msg.error = true;
      messages.push(msg);
    }
    const s = r.session as Partial<ChatSession> | null | undefined;
    const session =
      s && typeof s.token === "string" && typeof s.expiresAt === "number"
        ? { token: s.token, expiresAt: s.expiresAt }
        : null;
    return { messages: messages.slice(-MAX_STORED), session };
  } catch {
    return empty();
  }
}

export function saveChat(chat: StoredChat, store: Storage | null = getStorage()): void {
  if (!store) return;
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ messages: chat.messages.slice(-MAX_STORED), session: chat.session }),
    );
  } catch {
    /* quota or blocked storage */
  }
}

export function clearChat(store: Storage | null = getStorage()): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** A session token still worth sending (30 s of slack so it doesn't expire in flight). */
export function liveSession(s: ChatSession | null, now = Date.now()): string | undefined {
  return s && s.expiresAt - 30_000 > now ? s.token : undefined;
}

/** The messages to send: successful turns only, newest last, ending with the question. */
export function wireMessages(history: StoredMessage[], question: string): WireMessage[] {
  const ok = history
    .filter((m) => !m.error && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  return [...ok, { role: "user" as const, content: question }].slice(-MAX_HISTORY_MESSAGES);
}
