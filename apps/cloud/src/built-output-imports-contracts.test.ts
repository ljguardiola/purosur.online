import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, inject, it } from "vitest";

describe("the built cloud", () => {
  it("runs a module that imports @purosur/contracts under plain Node", () => {
    const registerCreationRouteUrl = pathToFileURL(
      join(inject("cloudBuildDir"), "register", "register-creation-route.js"),
    ).href;
    const script = `
      const module = await import(${JSON.stringify(registerCreationRouteUrl)});
      console.log(JSON.stringify({
        isFunction: typeof module.registerRegisterCreationRoute === "function",
      }));
    `;

    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ isFunction: true });
  });
});
