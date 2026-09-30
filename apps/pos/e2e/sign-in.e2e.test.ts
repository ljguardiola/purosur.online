import { afterAll, beforeAll, describe, it } from "vitest";
import { roleChange, userChange } from "./test-support/cloud-changes";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";

describe("signing in to the register", () => {
  let cloud: StandInCloud;
  let register: EnrolledRegister;

  beforeAll(async () => {
    cloud = await startStandInCloud([
      roleChange({ id: "role-cashier", name: "Cajero", permissionKeys: ["sell_and_charge"] }),
      await userChange({ id: "user-ana", firstName: "Ana", roleId: "role-cashier", pin: "4821" }),
      await userChange({
        id: "user-bruno",
        firstName: "Bruno",
        roleId: "role-cashier",
        pin: "7390",
      }),
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

  it("refuses a wrong PIN, signs in the person who enters their own, and leaves with Salir", async () => {
    const { page } = register;
    await page.getByText("Ana", { exact: true }).click();

    await page.getByLabel("PIN").fill("1111");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByText("PIN incorrecto", { exact: true }).waitFor();

    await page.getByLabel("PIN").fill("4821");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("heading", { name: "¿Qué querés hacer?" }).waitFor();

    await page.getByRole("button", { name: "Salir" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Salir" }).click();
    await page.getByRole("button", { name: "Entrar" }).waitFor();
  });
});
