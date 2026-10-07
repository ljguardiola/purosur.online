import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, inject, it } from "vitest";

// Node exits on its own once the module is imported, so the test waits for it however long the
// machine takes to load the module.
describe("the built migrations folder", { timeout: 0 }, () => {
  let checkoutParent: string | undefined;

  afterEach(() => {
    if (checkoutParent) {
      rmSync(checkoutParent, { recursive: true, force: true });
    }
  });

  it("resolves to the cloud's migrations from a checkout path with a space, a % and non-ASCII characters", () => {
    checkoutParent = realpathSync(mkdtempSync(join(tmpdir(), "purosur-checkout-")));
    const cloudDir = join(checkoutParent, "my checkout 100% ñandú", "apps", "cloud");
    mkdirSync(join(cloudDir, "dist", "platform", "db"), { recursive: true });
    cpSync(
      join(inject("cloudBuildDir"), "platform", "db", "migrations-folder.js"),
      join(cloudDir, "dist", "platform", "db", "migrations-folder.js"),
    );
    const moduleUrl = pathToFileURL(
      join(cloudDir, "dist", "platform", "db", "migrations-folder.js"),
    ).href;
    const script = `
      const { MIGRATIONS_FOLDER } = await import(${JSON.stringify(moduleUrl)});
      console.log(MIGRATIONS_FOLDER);
    `;

    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe(join(cloudDir, "migrations"));
  });
});
