import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, inject, it } from "vitest";

describe("the built cloud", () => {
  it("runs a module that imports @purosur/contracts under plain Node", () => {
    const registerValidationUrl = pathToFileURL(
      join(inject("cloudBuildDir"), "registers", "register-validation.js"),
    ).href;
    const script = `
      const { registerNameValidationFailure } = await import(${JSON.stringify(registerValidationUrl)});
      console.log(JSON.stringify({
        atLimit: registerNameValidationFailure("😀".repeat(100)) ?? null,
        overLimit: registerNameValidationFailure("😀".repeat(101)) ?? null,
      }));
    `;

    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      atLimit: null,
      overLimit: { field: "name", message: "name must be at most 100 characters" },
    });
  });
});
