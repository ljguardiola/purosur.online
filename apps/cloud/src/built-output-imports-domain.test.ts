import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, inject, it } from "vitest";

describe("the built cloud", () => {
  it("runs a module that imports @purosur/domain under plain Node", () => {
    const rolesListRouteUrl = pathToFileURL(
      join(inject("cloudBuildDir"), "access", "roles-list-route.js"),
    ).href;
    const script = `
      const module = await import(${JSON.stringify(rolesListRouteUrl)});
      console.log(JSON.stringify({
        isFunction: typeof module.registerRolesListRoute === "function",
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
