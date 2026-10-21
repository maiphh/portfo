/** Build-time chat settings (PUBLIC_* only). */
import { workerOrigin } from "~/lib/api";
import { USE_MOCKS } from "~/lib/flags";
import { chatEndpoint } from "./client";

/** Base URL of the portfo Worker, e.g. https://portfo.<account>.workers.dev (no trailing slash). */
export const WORKER_URL: string = workerOrigin(import.meta.env.PUBLIC_WORKER_URL);
/** The chat uses the local sample stream while mocks are on or no Worker URL is set. */
export const CHAT_MOCK: boolean = USE_MOCKS || WORKER_URL === "";
export const CHAT_ENDPOINT: string = WORKER_URL ? chatEndpoint(WORKER_URL) : "";
