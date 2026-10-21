/**
 * Exact counters in a Durable Object (SQLite-backed, works on the Workers Free plan).
 * One instance per visitor for the 10-minute window, and one per day for the global budget.
 * Each instance keeps only its current bucket.
 */
import { DurableObject } from "cloudflare:workers";

export interface TakeResult {
  ok: boolean;
  count: number;
}

export class Quota extends DurableObject {
  /** Adds one to `bucket` if it is below `limit`. A new bucket replaces the old one. */
  async take(bucket: string, limit: number): Promise<TakeResult> {
    const current = await this.ctx.storage.get<{ bucket: string; count: number }>("c");
    const count = current?.bucket === bucket ? current.count : 0;
    if (count >= limit) return { ok: false, count };
    await this.ctx.storage.put("c", { bucket, count: count + 1 });
    return { ok: true, count: count + 1 };
  }
}
