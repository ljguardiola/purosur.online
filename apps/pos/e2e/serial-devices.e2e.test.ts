import { describe, expect, it } from "vitest";
import { launchApp, writeChannelFile } from "./launch-app";
import { roleChange, userChange } from "./test-support/cloud-changes";
import { enrolledRegister } from "./test-support/enrolled-register";
import {
  SERIAL_DEVICE_WATCH_FAILED,
  SERIAL_DEVICES_LISTED,
} from "./test-support/serial-device-logs";
import { startStandInCloud } from "./test-support/stand-in-cloud";
import { untilLogged } from "./test-support/until";

const LINUS_ID = "5b0b8f4e-3c2d-4a55-9c1e-0a6f6a1d0a05";
const LINUS_EMAIL = "linus@example.com";

describe("the register's serial devices", () => {
  it("lists the serial ports of the machine once the register starts, loading serialport without failing", async () => {
    const launched = await launchApp(
      writeChannelFile({ channel: "staging", dataFolder: "purosur-pos-e2e-serial-devices" }),
    );
    try {
      await launched.app.firstWindow();

      await untilLogged(launched, SERIAL_DEVICES_LISTED);
      expect(launched.logs.join("")).not.toContain(SERIAL_DEVICE_WATCH_FAILED);
    } finally {
      await launched.app.close();
    }
  });

  it("shows the scale and the reader without a registration to whoever may register them, on the screen they land on after signing in", async () => {
    const cloud = await startStandInCloud(
      [
        roleChange({
          id: "role-installer",
          name: "Instalador",
          permissionKeys: ["enroll_register_devices"],
        }),
        await userChange({
          id: LINUS_ID,
          firstName: "Linus",
          roleId: "role-installer",
          pin: "4821",
        }),
      ],
      { signInLookups: { [LINUS_EMAIL]: { userId: LINUS_ID, hasPin: true } } },
    );
    const register = enrolledRegister(cloud);
    try {
      await register.launch();
      const { page } = register;

      await page.getByRole("link", { name: "Ingresar por primera vez" }).click();
      await page.getByLabel("Correo").fill(LINUS_EMAIL);
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByLabel("PIN").fill("4821");
      await page.getByRole("button", { name: "Entrar" }).click();

      await page.getByRole("heading", { level: 1, name: "Balanza y lector" }).waitFor();
      const devices = page.getByRole("main");
      await devices.getByText("Balanza sin registrar", { exact: true }).waitFor();
      await devices.getByText("Lector sin registrar", { exact: true }).waitFor();
      const status = page.getByRole("region", { name: "Estado de la caja" });
      await status.getByText("Balanza sin registrar", { exact: true }).waitFor();
      await status.getByText("Lector sin registrar", { exact: true }).waitFor();
    } finally {
      try {
        await register.close();
      } finally {
        await cloud.stop();
      }
    }
  });
});
