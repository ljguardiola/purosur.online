import { afterAll, beforeAll, describe, it } from "vitest";
import { registerChange, roleChange, userChange } from "./test-support/cloud-changes";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";

const ANA_ID = "5b0b8f4e-3c2d-4a55-9c1e-0a6f6a1d0a01";
const ANA_EMAIL = "ana@example.com";

describe("the register's cash session", () => {
  let cloud: StandInCloud;
  let register: EnrolledRegister;

  beforeAll(async () => {
    cloud = await startStandInCloud(
      [
        registerChange({ id: "register-1", name: "Caja 1" }),
        roleChange({ id: "role-cashier", name: "Cajero", permissionKeys: ["sell_and_charge"] }),
        await userChange({ id: ANA_ID, firstName: "Ana", roleId: "role-cashier", pin: "4821" }),
      ],
      { signInLookups: { [ANA_EMAIL]: { userId: ANA_ID, hasPin: true } } },
    );
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
    await page.getByRole("link", { name: "Ingresar por primera vez" }).click();
    await page.getByLabel("Correo").fill(ANA_EMAIL);
    await page.getByRole("button", { name: "Continuar" }).click();
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

  it("closes with a cash count and leaves the person signed in without a session", async () => {
    const { page } = register;
    await page.getByRole("link", { name: "Caja" }).click();
    await page.getByRole("button", { name: "Cerrar caja" }).click();
    await page.getByLabel("Efectivo contado").fill("19.600,00");
    await page.getByText("Faltan $ 400,00.", { exact: false }).first().waitFor();
    await page.getByRole("button", { name: "Cerrar caja" }).click();

    await page.getByRole("heading", { name: "¿Qué querés hacer?" }).waitFor();
    await page.getByRole("button", { name: "Abrir caja" }).waitFor();
  });
});
