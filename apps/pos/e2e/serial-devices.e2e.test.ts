import { describe, expect, it } from "vitest";
import { launchApp, writeChannelFile } from "./launch-app";
import {
  SERIAL_DEVICES_LISTED,
  SERIAL_PORTS_LISTING_FAILED,
} from "./test-support/serial-device-logs";
import { untilLogged } from "./test-support/until";

describe("the register's serial devices", () => {
  it("lists the serial ports of the machine once the register starts, loading serialport without failing", async () => {
    const launched = await launchApp(
      writeChannelFile({ channel: "staging", dataFolder: "purosur-pos-e2e-serial-devices" }),
    );
    try {
      await launched.app.firstWindow();

      await untilLogged(launched, SERIAL_DEVICES_LISTED);
      expect(launched.logs.join("")).not.toContain(SERIAL_PORTS_LISTING_FAILED);
    } finally {
      await launched.app.close();
    }
  });
});
