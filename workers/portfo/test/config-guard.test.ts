import { describe, expect, it } from "vitest";
import wranglerText from "../wrangler.jsonc?raw";
import { checkConfig, effectiveConfig, parseJsonc } from "../scripts/config-guard";

const wrangler = parseJsonc(wranglerText);

const fixture = (vars: Record<string, string>, prodVars?: Record<string, string>) =>
  parseJsonc(`{
    "name": "portfo",
    "d1_databases": [{ "binding": "DB", "database_name": "portfo", "database_id": "00000000-0000-0000-0000-000000000001" }],
    "vars": ${JSON.stringify(vars)},
    ${prodVars ? `"env": { "production": { "vars": ${JSON.stringify(prodVars)}, }, },` : ""}
  }`);

describe("deploy guard", () => {
  it("the committed top level has no placeholders", () => {
    expect(checkConfig(wrangler)).toEqual([]);
    const vars = effectiveConfig(wrangler).vars as Record<string, string>;
    expect(vars.ALLOWED_ORIGINS).toBe("http://localhost:4321");
    expect(vars.API_URL).toBeUndefined();
    expect(wrangler.build).toEqual({ command: "node scripts/check-config.ts" });
  });

  it("env.production repeats bindings and fails on REPLACE_ME", () => {
    const top = effectiveConfig(wrangler);
    const prod = (wrangler.env as Record<string, Record<string, unknown>>).production ?? {};
    for (const key of [
      "ai",
      "d1_databases",
      "ratelimits",
      "durable_objects",
      "migrations",
      "triggers",
    ])
      expect(prod[key], key).toEqual(top[key]);
    expect(Object.keys(prod.vars as object).sort()).toEqual(
      [...Object.keys(top.vars as object), "ENVIRONMENT"].sort(),
    );
    expect(prod.name).toBe("portfo");
    expect(prod.build).toEqual({ command: "node scripts/check-config.ts --env production" });

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

  it("fails on any REPLACE_ME value, top level or env", () => {
    expect(checkConfig(fixture({ ALLOWED_ORIGINS: "https://REPLACE_ME_SITE_DOMAIN" }))).toEqual([
      'vars.ALLOWED_ORIGINS is still a placeholder ("https://REPLACE_ME_SITE_DOMAIN")',
    ]);
  });
});
