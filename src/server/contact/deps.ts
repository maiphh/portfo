/** Production wiring for the worker: shared DB client, AI classifier, Resend notifier. */
import { getDb } from "~/db/client";
import { consoleLogger, type Env } from "../env";
import { defaultClassifier } from "./classify";
import { defaultNotifier } from "./notify";
import type { WorkerDeps } from "./worker";

export function productionWorkerDeps(env: Env = process.env): WorkerDeps {
  return {
    db: getDb(),
    classifier: defaultClassifier(env),
    notifier: defaultNotifier(env),
    log: consoleLogger,
  };
}
