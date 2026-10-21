import { describe, expect, it } from "vitest";
import wranglerText from "../wrangler.jsonc?raw";
import { checkConfig, effectiveConfig, parseJsonc } from "../scripts/config-guard";

const wrangler = parseJsonc(wranglerText);

const fixture = (vars: Record<string, string>, prodVars?: Record<string, string>) =>
  parseJsonc(`{
    "name": "portfo-api",
    "d1_databases": [{ "binding": "DB", "database_name": "portfo", "database_id": "00000000-0000-0000-0000-000000000001" }],
    "vars": ${JSON.stringify(vars)},
    ${prodVars ? `"env": { "production": { "vars": ${JSON.stringify(prodVars)}, }, },` : ""}
  }`);

describe("deploy guard", () => {
  it("the committed top level has no placeholders", () => {
    expect(checkConfig(wrangler)).toEqual([]);
    const vars = effectiveConfig(wrangler).vars as Record<string, string>;
    expect(vars.ALLOWED_ORIGINS).toBe("http://localhost:4321");
    expect(wrangler.build).toEqual({ command: "node scripts/check-config.ts" });
  });

  it("env.production repeats bindings and fails on REPLACE_ME", () => {
    const problems = checkConfig(wrangler, "production");
    for (const p of problems) expect(p).toMatch(/placeholder|https|ENVIRONMENT/);
  });

  it("production needs an https origin and ENVIRONMENT=production", () => {
    expect(
      checkConfig(
        fixture({}, { ALLOWED_ORIGINS: "http://localhost:4321", ENVIRONMENT: "production" }),
        "production",
      ),
    ).toEqual(["vars.ALLOWED_ORIGINS must include the https:// production origin"]);
    expect(
      checkConfig(
        fixture({}, { ALLOWED_ORIGINS: "https://maiphh.dev", ENVIRONMENT: "staging" }),
        "production",
      ),
    ).toEqual(['vars.ENVIRONMENT must be "production"']);
    expect(
      checkConfig(
        fixture({}, { ALLOWED_ORIGINS: "https://maiphh.dev", ENVIRONMENT: "production" }),
        "production",
      ),
    ).toEqual([]);
  });
});
