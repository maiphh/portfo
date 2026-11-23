import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.WALL_E2E_PORT ?? 4421);
const workerOrigin = process.env.WALL_ADMIN_WORKER_URL ?? "http://127.0.0.1:8877";
const serviceKey = process.env.WALL_ADMIN_SERVICE_KEY;
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const worker = new URL(workerOrigin);

if (!serviceKey || !password) {
  throw new Error(
    "Set WALL_ADMIN_SERVICE_KEY and ADMIN_BOOTSTRAP_PASSWORD for isolated live wall tests.",
  );
}
if (worker.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(worker.hostname)) {
  throw new Error("Wall tests publish content and rotate the password. Use a fresh local Worker.");
}

export default defineConfig({
  testDir: "e2e",
  testMatch: "wall-admin.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm dev --host localhost --port ${port} --ignore-lock`,
    port,
    reuseExistingServer: false,
    env: {
      PUBLIC_USE_MOCKS: "false",
      PUBLIC_WORKER_URL: workerOrigin,
      WALL_ADMIN_WORKER_URL: workerOrigin,
      WALL_ADMIN_SERVICE_KEY: serviceKey,
      ADMIN_BOOTSTRAP_PASSWORD: password,
    },
  },
});
