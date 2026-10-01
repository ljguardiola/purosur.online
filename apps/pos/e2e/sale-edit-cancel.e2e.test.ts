import { afterAll, beforeAll, describe, it } from "vitest";
import {
  categoryChange,
  priceChange,
  priceListChange,
  productChange,
  registerChange,
  roleChange,
  userChange,
} from "./test-support/cloud-changes";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";

const ANA_ID = "5b0b8f4e-3c2d-4a55-9c1e-0a6f6a1d0a01";
const ANA_EMAIL = "ana@example.com";
const YERBA_CODE = "7790001000011";
const ALFAJOR_CODE = "7790002000022";

describe("changing, removing and cancelling a sale on the register", () => {
  let cloud: StandInCloud;
  let register: EnrolledRegister;

  beforeAll(async () => {
    cloud = await startStandInCloud(
      [
        registerChange({ id: "register-1", name: "Caja 1" }),
        roleChange({ id: "role-cashier", name: "Cajero", permissionKeys: ["sell_and_charge"] }),
        await userChange({ id: ANA_ID, firstName: "Ana", roleId: "role-cashier", pin: "4821" }),
        categoryChange({ id: "category-1", name: "Almacén" }),
        productChange({
          id: "product-yerba",
          name: "Yerba mate 1 kg",
          categoryId: "category-1",
          barcodes: [YERBA_CODE],
        }),
        productChange({
          id: "product-alfajor",
          name: "Alfajor triple",
          categoryId: "category-1",
          barcodes: [ALFAJOR_CODE],
        }),
        priceListChange({ id: "price-list-1", name: "Mostrador" }),
        priceChange({
          id: "price-yerba",
          productId: "product-yerba",
          priceListId: "price-list-1",
          unitPriceCents: 238_000,
          validFrom: "2026-01-01T00:00:00.000Z",
        }),
        priceChange({
          id: "price-alfajor",
          productId: "product-alfajor",
          priceListId: "price-list-1",
          unitPriceCents: 50_000,
          validFrom: "2026-01-01T00:00:00.000Z",
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

  it("raises and lowers a quantity, removes a line, and cancels the sale", async () => {
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

    const scanField = page.getByRole("combobox", { name: "Producto" });
    const panel = page.getByRole("complementary", { name: "Panel de cobro" });
    const yerba = page.getByRole("listitem").filter({ hasText: "Yerba mate 1 kg" });
    const alfajor = page.getByRole("listitem").filter({ hasText: "Alfajor triple" });

    await scanField.fill(YERBA_CODE);
    await scanField.press("Enter");
    await yerba.getByText("$ 2.380,00").waitFor();

    await page.getByRole("button", { name: "Subir la cantidad de Yerba mate 1 kg" }).click();
    await yerba.getByText("$ 4.760,00").waitFor();
    await yerba.getByText("2", { exact: true }).waitFor();
    await panel.getByText("$ 4.760,00").first().waitFor();

    await page.getByRole("button", { name: "Bajar la cantidad de Yerba mate 1 kg" }).click();
    await yerba.getByText("$ 2.380,00").waitFor();
    await yerba.getByText("1", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Bajar la cantidad de Yerba mate 1 kg", disabled: true })
      .waitFor();

    await scanField.fill(ALFAJOR_CODE);
    await scanField.press("Enter");
    await alfajor.getByText("$ 500,00").waitFor();
    await panel.getByText("$ 2.880,00").first().waitFor();
    await panel.getByText("2 líneas").waitFor();

    await page.getByRole("button", { name: "Quitar Alfajor triple" }).click();
    await alfajor.waitFor({ state: "detached" });
    await panel.getByText("$ 2.380,00").first().waitFor();
    await panel.getByText("1 línea").waitFor();

    await page.getByRole("button", { name: "Cancelar venta" }).click();
    await page.getByRole("heading", { name: "¿Cancelar la venta?" }).waitFor();
    await page.getByRole("button", { name: "Cancelar la venta", exact: true }).click();

    await page.getByText("La venta está vacía").waitFor();
    await yerba.waitFor({ state: "detached" });
    await panel.getByText("0 líneas").waitFor();
  });
});
