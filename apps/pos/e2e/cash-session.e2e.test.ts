import { afterAll, beforeAll, describe, it } from "vitest";
import { registerChange, roleChange, userChange } from "./test-support/cloud-changes";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";

describe("the register's cash session", () => {
  let cloud: StandInCloud;
  let register: EnrolledRegister;

  beforeAll(async () => {
    cloud = await startStandInCloud([
      registerChange({ id: "register-1", name: "Caja 1" }),
      roleChange({ id: "role-cashier", name: "Cajero", permissionKeys: ["sell_and_charge"] }),
      await userChange({ id: "user-ana", firstName: "Ana", roleId: "role-cashier", pin: "4821" }),
    ]);
    register = enrolledRegister(cloud);
    await register.launch();
  }, 60_000);

  afterAll(async () => {
    try {
      await register?.close();
    } finally {
      await cloud?.stop();
    }
  });

  it("opens with a float and is resumed after a restart without asking for a PIN", async () => {
    const { page } = register;
    await page.getByText("Ana", { exact: true }).click();
    await page.getByLabel("PIN").fill("4821");
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.getByRole("button", { name: "Abrir caja" }).click();
    await page.getByLabel("Fondo inicial").fill("20.000,00");
    await page.getByRole("button", { name: "Abrir la caja" }).click();
    await page.getByRole("heading", { name: "Venta en curso" }).waitFor();

    await register.restart();

    const resumed = register.page;
    await resumed.getByRole("heading", { name: "Venta en curso" }).waitFor();
    await resumed.getByLabel("PIN").waitFor({ state: "detached" });
    await resumed.getByRole("button", { name: "Entrar" }).waitFor({ state: "detached" });
  });
});
