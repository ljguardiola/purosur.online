import { afterAll, beforeAll, describe, it } from "vitest";
import { roleChange, userChange } from "./test-support/cloud-changes";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";

const ANA_ID = "5b0b8f4e-3c2d-4a55-9c1e-0a6f6a1d0a01";
const BRUNO_ID = "5b0b8f4e-3c2d-4a55-9c1e-0a6f6a1d0a02";
const ANA_EMAIL = "ana@example.com";

describe("signing in to the register", () => {
  let cloud: StandInCloud;
  let register: EnrolledRegister;

  beforeAll(async () => {
    cloud = await startStandInCloud(
      [
        roleChange({ id: "role-cashier", name: "Cajero", permissionKeys: ["sell_and_charge"] }),
        await userChange({
          id: ANA_ID,
          firstName: "Ana",
          roleId: "role-cashier",
          pin: "4821",
        }),
        await userChange({
          id: BRUNO_ID,
          firstName: "Bruno",
          roleId: "role-cashier",
          pin: "7390",
        }),
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

  it("lists nobody until they sign in with their email, refuses a wrong PIN, and remembers them after Salir", async () => {
    const { page } = register;
    await page.getByText("Todavía nadie ingresó en esta caja.", { exact: true }).waitFor();

    await page.getByRole("link", { name: "Ingresar por primera vez" }).click();
    await page.getByLabel("Correo").fill(ANA_EMAIL);
    await page.getByRole("button", { name: "Continuar" }).click();

    await page.getByLabel("PIN").fill("1111");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByText("PIN incorrecto", { exact: true }).waitFor();

    await page.getByLabel("PIN").fill("4821");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("heading", { name: "¿Qué querés hacer?" }).waitFor();

    await page.getByRole("button", { name: "Salir" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Salir" }).click();
    await page.getByText("Ana", { exact: true }).waitFor();
    await page.getByText("Bruno", { exact: true }).waitFor({ state: "detached" });
  });
});
