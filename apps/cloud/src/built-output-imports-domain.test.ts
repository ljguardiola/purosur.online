import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, inject, it } from "vitest";

describe("the built cloud", () => {
  it("runs a module that imports @purosur/domain under plain Node", () => {
    const passkeyNameValidationUrl = pathToFileURL(
      join(inject("cloudBuildDir"), "access", "passkey-name-validation.js"),
    ).href;
    const script = `
      const { readPasskeyName } = await import(${JSON.stringify(passkeyNameValidationUrl)});
      console.log(JSON.stringify({
        atLimit: readPasskeyName({ passkey_name: "😀".repeat(40) }) ?? null,
        overLimit: readPasskeyName({ passkey_name: "😀".repeat(41) }) ?? null,
      }));
    `;

    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      atLimit: "😀".repeat(40),
      overLimit: null,
    });
  });
});
