import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { _electron as electron } from "playwright";
import { describe, expect, it } from "vitest";
import { serializeChannelFile } from "../src/shared/channel";
import { APP_DIR, appEnv } from "./launch-app";
import {
  SERIAL_DEVICE_WATCH_FAILED,
  SERIAL_DEVICES_LISTED,
} from "./test-support/serial-device-logs";
import { untilLogged } from "./test-support/until";

const PACKAGED_FOLDER = join(APP_DIR, "release", "staging", "win-unpacked");
const RESOURCES_FOLDER = join(PACKAGED_FOLDER, "resources");

function packagedExecutable(): string {
  const executables = readdirSync(PACKAGED_FOLDER).filter((name) => name.endsWith(".exe"));
  if (executables.length !== 1 || executables[0] === undefined) {
    throw new Error(
      `${PACKAGED_FOLDER} must hold exactly one executable, run pack:staging first; found ${executables.length}`,
    );
  }
  return join(PACKAGED_FOLDER, executables[0]);
}

// A packaged register reads its channel from resources/channel.json and keeps its data in the
// staging channel's folder under the user's application data, which a developer's machine may hold
// for real; only a CI runner, whose home is empty, is safe to start it on.
function requireCiRunner(): void {
  if (process.env["CI"] !== "true") {
    throw new Error(
      "the packaged register keeps its data in the staging channel's folder; run it on a CI runner only",
    );
  }
}

describe("the packaged register's serial devices", () => {
  it("ships the Windows serialport binding outside app.asar", () => {
    const unpacked = join(RESOURCES_FOLDER, "app.asar.unpacked");

    const bindings = readdirSync(unpacked, { recursive: true, encoding: "utf8" }).filter((path) =>
      path
        .replaceAll("\\", "/")
        .endsWith("bindings-cpp/prebuilds/win32-x64/@serialport+bindings-cpp.node"),
    );

    expect(bindings).toHaveLength(1);
  });

  it("loads serialport and lists the serial ports once it starts", async () => {
    requireCiRunner();
    writeFileSync(
      join(RESOURCES_FOLDER, "channel.json"),
      serializeChannelFile({ channel: "staging" }),
    );
    const app = await electron.launch({
      executablePath: packagedExecutable(),
      args: [],
      env: appEnv(join(RESOURCES_FOLDER, "channel.json")),
      timeout: 0,
    });
    const logs: string[] = [];
    app.process().stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
    app.process().stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
    try {
      await untilLogged({ app, logs }, SERIAL_DEVICES_LISTED);

      expect(logs.join("")).not.toContain(SERIAL_DEVICE_WATCH_FAILED);
    } finally {
      await app.close();
    }
  });
});
