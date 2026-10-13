import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DIR } from "./launch-app";
import { readAsarFile } from "./test-support/asar-file";

const RESOURCES_FOLDER = join(APP_DIR, "release", "staging", "win-unpacked", "resources");

describe("the packaged register's installer contents", () => {
  it("carries the version it was packaged with as the app's own version", () => {
    const packagedVersion = process.env["POS_VERSION"];
    if (packagedVersion === undefined) {
      throw new Error("POS_VERSION must name the version pack:staging packaged");
    }

    const metadata = JSON.parse(
      readAsarFile(join(RESOURCES_FOLDER, "app.asar"), "package.json").toString("utf8"),
    );

    expect(metadata.version).toBe(packagedVersion);
  });

  it("ships no update feed of electron-builder's own", () => {
    expect(existsSync(join(RESOURCES_FOLDER, "app-update.yml"))).toBe(false);
  });
});
