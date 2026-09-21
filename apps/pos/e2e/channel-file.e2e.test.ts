import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DIR, appEnv, launchApp, platformArgs, writeChannelFile } from "./launch-app";

// The electron package's main export is the path to its binary.
const ELECTRON_BINARY = createRequire(join(APP_DIR, "package.json"))("electron") as string;

describe("the register's channel file", () => {
  it("keeps the register's data in the folder its channel file names", async () => {
    const { app } = await launchApp(
      writeChannelFile({ channel: "staging", dataFolder: "purosur-pos-e2e-channel" }),
    );
    try {
      await app.firstWindow();
      const paths = await app.evaluate(({ app: electronApp }) => ({
        appData: electronApp.getPath("appData"),
        userData: electronApp.getPath("userData"),
        sessionData: electronApp.getPath("sessionData"),
      }));

      expect(paths.userData).toBe(join(paths.appData, "purosur-pos-e2e-channel"));
      expect(paths.sessionData).toBe(paths.userData);
    } finally {
      await app.close();
    }
  });

  it("refuses to start, saying why, when its channel file is malformed", () => {
    const channelFile = writeChannelFile({ channel: "staging", dataFolder: "purosur-pos" });

    const run = spawnSync(ELECTRON_BINARY, [APP_DIR, ...platformArgs()], {
      env: appEnv(channelFile),
      encoding: "utf8",
      timeout: 20_000,
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("register not started");
    expect(run.stderr).toContain(channelFile);
  });
});
