interface ImportMetaEnv {
  /** "false" turns off the labelled sample data for backend features. Defaults to "true". */
  readonly PUBLIC_USE_MOCKS?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  /** Base URL of the portfo-chat Worker. Unset means the chat window uses sample replies. */
  readonly PUBLIC_CHAT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Set once the hero intro has started; the inline failsafe un-hides the hero otherwise. */
  __hero?: number;
  /** The chat window's control API (see src/lib/chat/events.ts). */
  portfoChat?: import("./lib/chat/events").PortfoChatApi;
}

/** The chat window's events (see src/lib/chat/events.ts). */
interface DocumentEventMap {
  "portfo-chat:status": import("./lib/chat/events").PortfoChatEvents["portfo-chat:status"];
  "portfo-chat:state": import("./lib/chat/events").PortfoChatEvents["portfo-chat:state"];
  "portfo-chat:open": import("./lib/chat/events").PortfoChatEvents["portfo-chat:open"];
  "portfo-chat:close": import("./lib/chat/events").PortfoChatEvents["portfo-chat:close"];
}
