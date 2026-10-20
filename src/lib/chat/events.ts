/**
 * The chat window's small public API, for the mascot (PR 3) and anything else on the page.
 *
 * Events, dispatched on `document`:
 *   portfo-chat:status  { tool, label }          each tool call while thinking ("Reading the case study…")
 *   portfo-chat:state   { phase, status, open }  every phase change: idle | verifying | thinking |
 *                                                answering | done | error, and open/close
 *   portfo-chat:open    { }                      the panel opened
 *   portfo-chat:close   { }                      the panel closed
 *
 * Control: `window.portfoChat.open(opener?)`, `.close()`, `.toggle(opener?)`, `.isOpen()`,
 * `.phase()`, or any element with `data-chat-open` (a click opens the panel and focus returns
 * to that element on close). The launcher is `[data-chat-launcher]`.
 */
import type { Phase, Status } from "./state";

export interface ChatStateDetail {
  phase: Phase;
  status: Status | null;
  open: boolean;
}

export interface PortfoChatEvents {
  "portfo-chat:status": CustomEvent<Status>;
  "portfo-chat:state": CustomEvent<ChatStateDetail>;
  "portfo-chat:open": CustomEvent<Record<string, never>>;
  "portfo-chat:close": CustomEvent<Record<string, never>>;
}

export interface PortfoChatApi {
  open(opener?: HTMLElement | null): Promise<void>;
  close(): void;
  toggle(opener?: HTMLElement | null): Promise<void>;
  isOpen(): boolean;
  phase(): Phase;
}

export function emit<K extends keyof PortfoChatEvents>(
  type: K,
  detail: PortfoChatEvents[K]["detail"],
): void {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}
