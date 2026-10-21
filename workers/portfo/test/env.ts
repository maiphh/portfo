import { env as raw } from "cloudflare:workers";
import type { Env } from "../src/env";

/** Typed Miniflare bindings for tests. */
export const env = raw as unknown as Env;
