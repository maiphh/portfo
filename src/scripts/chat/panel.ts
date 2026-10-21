/**
 * The chat panel: open/close (focus trap, Esc, focus return), the conversation, streaming,
 * and the session token. Model text only ever goes in through textContent.
 */
import { CHAT_ENDPOINT, CHAT_MOCK } from "~/lib/chat/config";
import { ChatHttpError, MAX_INPUT_CHARS, streamChat } from "~/lib/chat/client";
import { friendlyError } from "~/lib/chat/errors";
import { emit } from "~/lib/chat/events";
import { keyboardInset } from "~/lib/chat/geometry";
import {
  clearChat,
  liveSession,
  loadChat,
  saveChat,
  wireMessages,
  type StoredChat,
  type StoredMessage,
} from "~/lib/chat/history";
import { MOCK_SCENARIOS, mockStream, type MockScenario } from "~/lib/chat/mock";
import type { ChatEvent, Source } from "~/lib/chat/sse";
import { initialTurn, isBusy, reduce, type Action, type TurnState } from "~/lib/chat/state";
import { tidy } from "~/lib/chat/text";

const SHEET = window.matchMedia("(max-width: 1279.98px)");
const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)");
const WELCOME =
  "Hi! Ask me about Phu's work: his projects, experience and how things were built. I answer from his CV, case studies and public GitHub activity.";
const IDLE_STATUS = "Answers from his CV, work and GitHub";

const $ = <T extends HTMLElement>(s: string, c: ParentNode = document) => {
  const el = c.querySelector<T>(s);
  if (!el) throw new Error(`chat: missing ${s}`);
  return el;
};

const root = $<HTMLElement>("[data-chat-root]");
const dialog = $<HTMLElement>("[data-chat]", root);
const scrim = $<HTMLElement>("[data-chat-scrim]", root);
const log = $<HTMLElement>("[data-chat-log]", root);
const form = $<HTMLFormElement>("[data-chat-form]", root);
const input = $<HTMLInputElement>("[data-chat-input]", root);
const send = $<HTMLButtonElement>("[data-chat-send]", root);
const count = $<HTMLElement>("[data-chat-count]", root);
const used = $<HTMLElement>("[data-chat-used]", root);
const statusLine = $<HTMLElement>("[data-chat-status]", root);
const live = $<HTMLElement>("[data-chat-live]", root);
const sugg = $<HTMLElement>("[data-chat-sugg]", root);

let chat: StoredChat = loadChat();
let turn: TurnState = initialTurn;
let isOpen = false;
let opener: HTMLElement | null = null;
let abort: AbortController | null = null;
let closeTimer = 0;

/** Mock-only failure switch for tests and screenshots: ?chat-mock=rate_limited etc. */
function mockScenario(): MockScenario {
  const v = new URLSearchParams(location.search).get("chat-mock") ?? "ok";
  return (MOCK_SCENARIOS as readonly string[]).includes(v) ? (v as MockScenario) : "ok";
}

/* ---------- state + events ---------- */

function publish(): void {
  dialog.dataset.phase = turn.phase;
  emit("portfo-chat:state", { phase: turn.phase, status: turn.status, open: isOpen });
}

function dispatch(a: Action): void {
  const prev = turn;
  turn = reduce(turn, a);
  if (turn === prev) return;
  if (turn.status && turn.status !== prev.status) {
    emit("portfo-chat:status", { ...turn.status });
    announce(turn.status.label);
  }
  if (turn.phase !== prev.phase || turn.status !== prev.status) {
    renderStatusLine();
    publish();
  }
}

function announce(text: string): void {
  live.textContent = "";
  // A fresh text node after a tick so repeated labels are still read.
  setTimeout(() => (live.textContent = text), 30);
}

function renderStatusLine(): void {
  statusLine.replaceChildren();
  const label =
    turn.phase === "thinking"
      ? (turn.status?.label ?? "Thinking…")
      : turn.phase === "answering"
        ? "Answering…"
        : null;
  if (label) {
    const b = document.createElement("b");
    b.textContent = label;
    statusLine.append(b);
  } else statusLine.textContent = IDLE_STATUS;
  const busy = isBusy(turn.phase);
  send.disabled = busy;
  send.setAttribute("aria-label", busy ? "Sending…" : "Send");
  for (const b of sugg.querySelectorAll("button")) b.disabled = busy;
}

/* ---------- rendering (textContent only) ---------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function userMsg(text: string): HTMLElement {
  const m = el("div", "chat-msg me");
  m.append(el("p", undefined, text));
  return m;
}

interface BotView {
  root: HTMLElement;
  think: HTMLElement;
  thinkLabel: HTMLElement;
  ans: HTMLElement;
  srcs: HTMLUListElement;
}

function botMsg(): BotView {
  const root = el("div", "chat-msg bot");
  const lbl = el("p", "lbl", "Phu's assistant");
  if (CHAT_MOCK) lbl.append(el("i", undefined, "sample reply †"));
  const bubble = el("div", "bubble");
  const think = el("p", "chat-think");
  const dots = el("span", "dots3");
  dots.setAttribute("aria-hidden", "true");
  dots.append(el("i"), el("i"), el("i"));
  const thinkLabel = el("b", undefined, "Thinking…");
  think.append(dots, thinkLabel);
  think.hidden = true;
  const ans = el("p", "ans");
  const srcs = el("ul", "chat-srcs");
  srcs.setAttribute("aria-label", "Sources");
  srcs.hidden = true;
  bubble.append(think, ans, srcs);
  root.append(lbl, bubble);
  return { root, think, thinkLabel, ans, srcs };
}

function renderSources(ul: HTMLUListElement, sources: Source[]): void {
  ul.replaceChildren(
    ...sources.map((s) => {
      const li = el("li");
      const a = el("a", "chip", s.title);
      a.href = s.href;
      if (/^https?:/.test(s.href)) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      li.append(a);
      return li;
    }),
  );
  ul.hidden = sources.length === 0;
}

function retryButton(question: string): HTMLButtonElement {
  const b = el("button", "chat-retry", "Try again");
  b.type = "button";
  b.addEventListener("click", () => {
    b.remove();
    void ask(question, { retry: true });
  });
  return b;
}

function renderStored(m: StoredMessage, i: number, all: StoredMessage[]): HTMLElement {
  if (m.role === "user") return userMsg(m.content);
  const v = botMsg();
  v.ans.textContent = tidy(m.content);
  renderSources(v.srcs, m.sources ?? []);
  if (m.error) {
    v.root.classList.add("is-error");
    const q = all[i - 1];
    if (i === all.length - 1 && q?.role === "user") v.ans.after(retryButton(q.content));
  }
  return v.root;
}

function renderLog(): void {
  const welcome = botMsg();
  welcome.ans.textContent = WELCOME;
  welcome.root.querySelector(".lbl i")?.remove();
  log.replaceChildren(welcome.root, ...chat.messages.map(renderStored));
  scrollLog(true);
}

function scrollLog(force = false): void {
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  if (force || near) log.scrollTop = log.scrollHeight;
}

/* ---------- asking ---------- */

function persist(): void {
  saveChat(chat);
}

async function* events(question: string, history: StoredMessage[], signal: AbortSignal) {
  if (CHAT_MOCK) {
    yield* mockStream(question, {
      signal,
      scenario: mockScenario(),
      newSession: !liveSession(chat.session),
    });
    return;
  }
  const messages = wireMessages(history, question);
  const sessionToken = liveSession(chat.session);
  yield* streamChat(
    CHAT_ENDPOINT,
    { messages, ...(sessionToken ? { sessionToken } : {}) },
    { signal, origin: location.origin },
  );
}

async function ask(raw: string, opts: { retry?: boolean } = {}): Promise<void> {
  const question = raw.trim().slice(0, MAX_INPUT_CHARS);
  if (!question || isBusy(turn.phase)) return;
  if (raw.trim().length > MAX_INPUT_CHARS) {
    announce(friendlyError("too_long").message);
    return;
  }

  // A retry replaces the failed answer instead of repeating the question.
  if (opts.retry && chat.messages.at(-1)?.error) {
    chat.messages.pop();
    log.lastElementChild?.remove();
  } else {
    chat.messages.push({ role: "user", content: question });
    log.append(userMsg(question));
  }
  const history = chat.messages.slice(0, -1);
  persist();

  const view = botMsg();
  view.think.hidden = false;
  view.ans.setAttribute("aria-busy", "true");
  log.append(view.root);
  scrollLog(true);

  dispatch({ type: "send" });
  abort = new AbortController();
  const signal = abort.signal;

  const apply = (ev: ChatEvent) => {
    if (ev.type === "session") {
      chat.session = { token: ev.token, expiresAt: ev.expiresAt };
      persist();
    }
    dispatch({ type: "event", event: ev });
    if (turn.status) view.thinkLabel.textContent = turn.status.label;
    view.think.hidden = turn.phase !== "thinking";
    if (turn.text) view.ans.textContent = tidy(turn.text);
    renderSources(view.srcs, turn.sources);
    scrollLog();
  };

  try {
    for await (const ev of events(question, history, signal)) {
      apply(ev);
      if (!isBusy(turn.phase) && ev.type !== "error") break;
    }
    if (signal.aborted) return;
    if (isBusy(turn.phase)) throw new ChatHttpError("interrupted");
  } catch (e) {
    if (signal.aborted) return; // closed or cleared; the view is gone
    const err =
      e instanceof ChatHttpError
        ? friendlyError(e.code, { retryAfter: e.retryAfter, serverMessage: e.serverMessage })
        : friendlyError("network");
    dispatch({ type: "fail", error: err });
  } finally {
    if (abort?.signal === signal) abort = null;
  }

  view.think.hidden = true;
  view.ans.removeAttribute("aria-busy");
  if (turn.phase === "error" && turn.error) {
    view.root.classList.add("is-error");
    view.ans.textContent = turn.error.message;
    view.srcs.hidden = true;
    if (turn.error.retry) view.ans.after(retryButton(question));
    announce(turn.error.message);
    chat.messages.push({ role: "assistant", content: turn.error.message, error: true });
  } else {
    chat.messages.push({
      role: "assistant",
      content: turn.text,
      ...(turn.sources.length && { sources: turn.sources }),
    });
  }
  persist();
  scrollLog();
}

/* ---------- open / close ---------- */

function focusables(): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]),input:not([disabled]),a[href],iframe,[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((e) => e.getClientRects().length > 0 || e === document.activeElement);
}

function onKey(e: KeyboardEvent): void {
  if (!isOpen) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeChat();
    return;
  }
  if (e.key !== "Tab") return;
  const f = focusables();
  const first = f[0];
  const last = f.at(-1);
  if (!first || !last) return;
  const a = document.activeElement;
  if (e.shiftKey && (a === first || !dialog.contains(a))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (a === last || !dialog.contains(a))) {
    e.preventDefault();
    first.focus();
  }
}

function onFocusIn(e: FocusEvent): void {
  if (!isOpen || dialog.contains(e.target as Node)) return;
  input.focus({ preventScroll: true });
}

function onPointerDown(e: PointerEvent): void {
  if (!isOpen || SHEET.matches) return; // the sheet's scrim handles taps outside
  const t = e.target as Element;
  if (dialog.contains(t) || t.closest("[data-chat-launcher],[data-chat-open]")) return;
  closeChat({ restoreFocus: false });
}

function syncViewport(): void {
  const vv = window.visualViewport;
  const kb = keyboardInset(window.innerHeight, vv);
  const s = document.documentElement.style;
  s.setProperty("--chat-kb", `${kb}px`);
  s.setProperty("--chat-vvh", `${Math.round(vv?.height ?? window.innerHeight)}px`);
  document.documentElement.classList.toggle("chat-kb-open", kb > 0);
  if (kb > 0 && document.activeElement === input) scrollLog(true);
}

function setSheetClass(): void {
  document.documentElement.classList.toggle("chat-is-sheet-open", isOpen && SHEET.matches);
  scrim.hidden = !(isOpen && SHEET.matches);
  scrim.classList.toggle("is-open", isOpen && SHEET.matches);
}

export function openChat(from: HTMLElement | null): void {
  if (isOpen) {
    input.focus();
    return;
  }
  clearTimeout(closeTimer);
  opener = from ?? (document.activeElement as HTMLElement | null);
  isOpen = true;
  if (!log.childElementCount) renderLog();
  dialog.hidden = false;
  setSheetClass();
  syncViewport();
  if (REDUCE.matches) dialog.classList.add("is-open");
  else {
    void dialog.offsetWidth; // start the transition from the closed transform
    requestAnimationFrame(() => dialog.classList.add("is-open"));
  }
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("pointerdown", onPointerDown, true);
  window.visualViewport?.addEventListener("resize", syncViewport);
  window.visualViewport?.addEventListener("scroll", syncViewport);
  // On touch screens, don't pop the keyboard over the conversation straight away.
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  (coarse && chat.messages.length ? log : input).focus({ preventScroll: true });
  scrollLog(true);
  emit("portfo-chat:open", {});
  publish();
}

export function closeChat(opts: { clear?: boolean; restoreFocus?: boolean } = {}): void {
  if (!isOpen) return;
  isOpen = false;
  if (opts.clear) {
    abort?.abort();
    abort = null;
    chat = { messages: [], session: chat.session };
    clearChat();
    persist();
    turn = initialTurn;
    renderStatusLine();
    log.replaceChildren();
  }
  document.removeEventListener("keydown", onKey, true);
  document.removeEventListener("focusin", onFocusIn);
  document.removeEventListener("pointerdown", onPointerDown, true);
  window.visualViewport?.removeEventListener("resize", syncViewport);
  window.visualViewport?.removeEventListener("scroll", syncViewport);
  dialog.classList.remove("is-open");
  setSheetClass();
  const hide = () => {
    if (!isOpen) dialog.hidden = true;
  };
  if (REDUCE.matches) hide();
  else closeTimer = window.setTimeout(hide, 400);
  if (opts.restoreFocus !== false && opener?.isConnected) opener.focus({ preventScroll: true });
  emit("portfo-chat:close", {});
  publish();
}

/* ---------- wiring (once, when this module loads) ---------- */

function updateCount(): void {
  const n = input.value.length;
  used.textContent = String(n);
  count.classList.toggle("is-near", n >= MAX_INPUT_CHARS - 50 && n < MAX_INPUT_CHARS);
  count.classList.toggle("is-full", n >= MAX_INPUT_CHARS);
  if (n >= MAX_INPUT_CHARS) announce(`Limit reached: ${MAX_INPUT_CHARS} characters.`);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = input.value;
  if (!q.trim() || isBusy(turn.phase)) return;
  input.value = "";
  updateCount();
  void ask(q);
});
input.addEventListener("input", () => {
  // maxlength already stops typing; this also trims a paste in browsers that let it through.
  if (input.value.length > MAX_INPUT_CHARS) input.value = input.value.slice(0, MAX_INPUT_CHARS);
  updateCount();
});
sugg.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button[data-q]");
  if (b?.dataset.q) void ask(b.dataset.q);
});
$<HTMLButtonElement>("[data-chat-min]", root).addEventListener("click", () => closeChat());
$<HTMLButtonElement>("[data-chat-close]", root).addEventListener("click", () =>
  closeChat({ clear: true }),
);
scrim.addEventListener("click", () => closeChat());
log.addEventListener("click", (e) => {
  // Following a link to a section of this page: get the sheet out of the way.
  const a = (e.target as Element).closest<HTMLAnchorElement>("a.chip");
  if (a && a.origin === location.origin && a.pathname === location.pathname && a.hash)
    closeChat({ restoreFocus: false });
});
SHEET.addEventListener("change", () => isOpen && setSheetClass());
renderStatusLine();
