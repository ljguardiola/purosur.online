import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { _electron as electron } from "playwright";
import { describe, expect, it } from "vitest";
import { serializeChannelFile } from "../src/shared/channel";
import { appEnv } from "./launch-app";
import { WAIT_BOUND_MS } from "./test-support/bounds";
import { closeRegister } from "./test-support/close-register";
import {
  SERIAL_DEVICE_WATCH_FAILED,
  SERIAL_DEVICES_LISTED,
} from "./test-support/serial-device-logs";
import { packagedExecutable, RESOURCES_FOLDER, requireCiRunner } from "./test-support/packaged-register";
import { untilLogged } from "./test-support/until";

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
      timeout: WAIT_BOUND_MS,
    });
    const logs: string[] = [];
    app.process().stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
    app.process().stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString()));
    try {
      await untilLogged({ app, logs }, SERIAL_DEVICES_LISTED, { withinMs: WAIT_BOUND_MS });
      expect(logs.join("")).not.toContain(SERIAL_DEVICE_WATCH_FAILED);
    } finally {
      await closeRegister(app);
    }
  });
});
