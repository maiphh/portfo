/** Build-time chat settings (PUBLIC_* only). */
import { TURNSTILE_SITE_KEY, USE_MOCKS } from "~/lib/flags";
import { chatEndpoint } from "./client";

/** Base URL of the portfo-chat Worker, e.g. https://portfo-chat.<account>.workers.dev. */
export const CHAT_URL: string = (import.meta.env.PUBLIC_CHAT_URL ?? "").trim();
/** The chat uses the local sample stream while mocks are on or no Worker URL is set. */
export const CHAT_MOCK: boolean = USE_MOCKS || CHAT_URL === "";
export const CHAT_ENDPOINT: string = CHAT_URL ? chatEndpoint(CHAT_URL) : "";
export { TURNSTILE_SITE_KEY };
