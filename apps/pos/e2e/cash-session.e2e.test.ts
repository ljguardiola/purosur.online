import { afterAll, beforeAll, describe, it } from "vitest";
import { registerChange, roleChange, userChange } from "./test-support/cloud-changes";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";

const ANA_ID = "5b0b8f4e-3c2d-4a55-9c1e-0a6f6a1d0a01";
const ANA_EMAIL = "ana@example.com";
const BRUNO_ID = "5b0b8f4e-3c2d-4a55-9c1e-0a6f6a1d0a02";
const BRUNO_EMAIL = "bruno@example.com";
const CARLA_ID = "5b0b8f4e-3c2d-4a55-9c1e-0a6f6a1d0a03";
const CARLA_EMAIL = "carla@example.com";

describe("the register's cash session", () => {
  let cloud: StandInCloud;
  let register: EnrolledRegister;

  beforeAll(async () => {
    cloud = await startStandInCloud(
      [
        registerChange({ id: "register-1", name: "Caja 1" }),
        roleChange({ id: "role-cashier", name: "Cajero", permissionKeys: ["sell_and_charge"] }),
        await userChange({ id: ANA_ID, firstName: "Ana", roleId: "role-cashier", pin: "4821" }),
        roleChange({
          id: "role-supervisor",
          name: "Encargado",
          permissionKeys: ["sell_and_charge", "close_anothers_register_session"],
        }),
        await userChange({
          id: BRUNO_ID,
          firstName: "Bruno",
          roleId: "role-supervisor",
          pin: "7314",
        }),
        await userChange({ id: CARLA_ID, firstName: "Carla", roleId: "role-cashier", pin: "5260" }),
      ],
      {
        signInLookups: {
          [ANA_EMAIL]: { userId: ANA_ID, hasPin: true },
          [BRUNO_EMAIL]: { userId: BRUNO_ID, hasPin: true },
          [CARLA_EMAIL]: { userId: CARLA_ID, hasPin: true },
        },
      },
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

  it("opens with a float and, after a restart, comes back locked until the opener's PIN resumes it", async () => {
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

    const restarted = register.page;
    await restarted.getByRole("heading", { name: "Caja bloqueada" }).waitFor();
    await restarted.getByRole("radio", { name: "Ana" }).waitFor();
    await restarted
      .getByRole("link", { name: "Ingresar por primera vez" })
      .waitFor({ state: "detached" });
    await restarted.getByLabel("PIN").fill("4821");
    await restarted.getByRole("button", { name: "Retomar" }).click();
    await restarted.getByRole("heading", { name: "Venta en curso" }).waitFor();
  });

  it("leaves the register locked from Salir and resumes it with the opener's PIN", async () => {
    const { page } = register;
    await page.getByRole("button", { name: "Salir" }).click();
    await page.getByRole("button", { name: "Dejar bloqueada" }).click();
    await page.getByRole("heading", { name: "Caja bloqueada" }).waitFor();

    await page.getByLabel("PIN").fill("4821");
    await page.getByRole("button", { name: "Retomar" }).click();

    await page.getByRole("heading", { name: "Venta en curso" }).waitFor();
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

  it("asks to close the open session before leaving and ends at the entry screen once closed", async () => {
    const { page } = register;
    await page.getByRole("button", { name: "Abrir caja" }).click();
    await page.getByLabel("Fondo inicial").fill("20.000,00");
    await page.getByRole("button", { name: "Abrir la caja" }).click();
    await page.getByRole("heading", { name: "Venta en curso" }).waitFor();

    await page.getByRole("button", { name: "Salir" }).click();
    const dialog = page.getByRole("dialog", { name: "¿Cerrar la caja o dejarla bloqueada?" });
    await dialog.getByRole("button", { name: "Cerrar caja" }).click();
    await page.getByLabel("Efectivo contado").fill("20.000,00");
    await page.getByRole("button", { name: "Cerrar caja" }).click();

    await page.getByRole("heading", { name: "¿Quién abre la caja?" }).waitFor();
    await page.getByRole("heading", { name: "¿Qué querés hacer?" }).waitFor({ state: "detached" });
  });

  it("is closed from the lock screen by another person with permission, who is left signed out", async () => {
    const { page } = register;
    for (const [email, pin] of [
      [BRUNO_EMAIL, "7314"],
      [CARLA_EMAIL, "5260"],
    ] as const) {
      await page.getByRole("link", { name: "Ingresar por primera vez" }).click();
      await page.getByLabel("Correo").fill(email);
      await page.getByRole("button", { name: "Continuar" }).click();
      await page.getByLabel("PIN").fill(pin);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.getByRole("heading", { name: "¿Qué querés hacer?" }).waitFor();
      await page.getByRole("button", { name: "Salir" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Salir" }).click();
    }

    await page.getByText("Ana", { exact: true }).click();
    await page.getByLabel("PIN").fill("4821");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("button", { name: "Abrir caja" }).click();
    await page.getByLabel("Fondo inicial").fill("20.000,00");
    await page.getByRole("button", { name: "Abrir la caja" }).click();
    await page.getByRole("heading", { name: "Venta en curso" }).waitFor();
    await page.getByRole("button", { name: "Salir" }).click();
    await page.getByRole("button", { name: "Dejar bloqueada" }).click();

    await page.getByRole("link", { name: "Otra persona cierra la caja" }).click();
    await page.getByRole("heading", { name: "¿Quién cierra la caja?" }).waitFor();
    await page.getByRole("radio", { name: "Bruno" }).waitFor({ state: "attached" });
    await page.getByRole("radio", { name: "Carla" }).waitFor({ state: "detached" });
    await page.getByText("Efectivo contado").waitFor({ state: "detached" });
    await page.getByText("Bruno", { exact: true }).click();
    await page.getByLabel("PIN").fill("7314");
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByText("Cierra Bruno. La sesión es de Ana.").waitFor();
    await page.getByLabel("Efectivo contado").fill("20.000,00");
    await page.getByRole("button", { name: "Cerrar caja" }).click();

    await page.getByRole("heading", { name: "¿Quién abre la caja?" }).waitFor();
    await page.getByRole("heading", { name: "Caja bloqueada" }).waitFor({ state: "detached" });
  });
});
