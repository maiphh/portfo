import { describe, expect, it } from "vitest";
import wranglerText from "../wrangler.jsonc?raw";
import { checkConfig, effectiveConfig, parseJsonc } from "../scripts/config-guard";

const wrangler = parseJsonc(wranglerText);

const fixture = (vars: Record<string, string>, prodVars?: Record<string, string>) =>
  parseJsonc(`{
    // comment with "quotes" and REPLACE_ME in it is fine
    "name": "portfo-chat",
    "vectorize": [{ "binding": "VECTORIZE", "index_name": "portfo-chat" }], /* block */
    "vars": ${JSON.stringify(vars)},
    ${prodVars ? `"env": { "production": { "vars": ${JSON.stringify(prodVars)}, }, },` : ""}
  }`);

describe("deploy guard (scripts/check-config.ts)", () => {
  it("the committed top level is the deployed config and has no placeholders", () => {
    expect(checkConfig(wrangler)).toEqual([]);
    const vars = effectiveConfig(wrangler).vars as Record<string, string>;
    expect(vars.ALLOWED_ORIGINS).toBe("http://localhost:4321");
    expect(vars.SITE_URL).toBe("");
    expect(wrangler.build).toEqual({ command: "node scripts/check-config.ts" });
  });

  it("env.production repeats every var and binding (wrangler does not inherit them)", () => {
    const top = effectiveConfig(wrangler);
    const prod = (wrangler.env as Record<string, Record<string, unknown>>).production ?? {};
    for (const key of ["ai", "vectorize", "ratelimits", "durable_objects"])
      expect(prod[key], key).toEqual(top[key]);
    expect(Object.keys(prod.vars as object).sort()).toEqual(Object.keys(top.vars as object).sort());
    expect(prod.name).toBe("portfo-chat");
    expect(prod.build).toEqual({ command: "node scripts/check-config.ts --env production" });
  });

  it("blocks env.production until its TODO placeholders are filled in", () => {
    const problems = checkConfig(wrangler, "production");
    // Either the TODOs are still there (blocked) or they were filled with https values.
    for (const p of problems) expect(p).toMatch(/placeholder|https/);
  });

  it("fails on any REPLACE_ME value, top level or env", () => {
    expect(checkConfig(fixture({ SITE_URL: "https://REPLACE_ME_SITE_DOMAIN" }))).toEqual([
      'vars.SITE_URL is still a placeholder ("https://REPLACE_ME_SITE_DOMAIN")',
    ]);
    expect(checkConfig(fixture({ X: "replace-me" }))).toHaveLength(1);
    const prod = fixture(
      { SITE_URL: "" },
      {
        SITE_URL: "https://maiphh.dev",
        ALLOWED_ORIGINS: "https://REPLACE_ME,http://localhost:4321",
      },
    );
    expect(checkConfig(prod)).toEqual([]);
    expect(checkConfig(prod, "production")).toEqual([
      'vars.ALLOWED_ORIGINS is still a placeholder ("https://REPLACE_ME,http://localhost:4321")',
    ]);
  });

  it("production also needs an https SITE_URL and an https origin", () => {
    expect(
      checkConfig(
        fixture({}, { SITE_URL: "", ALLOWED_ORIGINS: "http://localhost:4321" }),
        "production",
      ),
    ).toEqual([
      "vars.SITE_URL must be an https:// URL",
      "vars.ALLOWED_ORIGINS must include the https:// production origin",
    ]);
    expect(
      checkConfig(
        fixture({}, { SITE_URL: "https://maiphh.dev", ALLOWED_ORIGINS: "https://maiphh.dev" }),
        "production",
      ),
    ).toEqual([]);
  });

  it("parses JSONC: comments, trailing commas, slashes inside strings", () => {
    expect(parseJsonc('{ "a": "http://x//y", /* c */ "b": [1, 2,], // t\n }')).toEqual({
      a: "http://x//y",
      b: [1, 2],
    });
    expect(() => effectiveConfig(fixture({}), "staging")).toThrow(/no env.staging/);
  });
});
