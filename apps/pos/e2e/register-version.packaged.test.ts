import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { _electron as electron } from "playwright";
import { describe, it } from "vitest";
import { serializeChannelFile } from "../src/shared/channel";
import { appEnv } from "./launch-app";
import { WAIT_BOUND_MS } from "./test-support/bounds";
import { closeRegister } from "./test-support/close-register";
import {
  packagedExecutable,
  RESOURCES_FOLDER,
  requireCiRunner,
} from "./test-support/packaged-register";

describe("the packaged register's version", () => {
  it("reads the version it was packaged with on the enrollment screen", async () => {
    const packagedVersion = process.env["POS_VERSION"];
    if (packagedVersion === undefined) {
      throw new Error("POS_VERSION must name the version pack:staging packaged");
    }
    requireCiRunner();
    writeFileSync(
      join(RESOURCES_FOLDER, "channel.json"),
      serializeChannelFile({ channel: "staging" }),
    );
    const app = await electron.launch({
      executablePath: packagedExecutable(),
      args: [],
      env: appEnv(join(RESOURCES_FOLDER, "channel.json")),
      timeout: WAIT_BOUND_MS,
    });
    try {
      const page = await app.firstWindow();
      await page
        .getByText(`Versión ${packagedVersion}`, { exact: true })
        .waitFor({ timeout: WAIT_BOUND_MS });
    } finally {
      await closeRegister(app);
    }
  });
});
