import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const CAFE_CODE = "7790001000011";
const ALFAJOR_CODE = "7790002000022";

describe("searching products by name into a sale on the register", () => {
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
          id: "product-cafe",
          name: "Café molido 500 g",
          categoryId: "category-1",
          barcodes: [CAFE_CODE],
        }),
        productChange({
          id: "product-alfajor",
          name: "Alfajor triple",
          categoryId: "category-1",
          barcodes: [ALFAJOR_CODE],
        }),
        priceListChange({ id: "price-list-1", name: "Mostrador" }),
        priceChange({
          id: "price-cafe",
          productId: "product-cafe",
          priceListId: "price-list-1",
          unitPriceCents: 238_000,
          validFrom: "2026-01-01T00:00:00.000Z",
        }),
      ],
      { signInLookups: { [ANA_EMAIL]: { userId: ANA_ID, hasPin: true } } },
    );
    register = enrolledRegister(cloud);
    await register.launch();
  });

  afterAll(async () => {
    try {
      await register?.close();
    } finally {
      await cloud?.stop();
    }
  });

  it("adds the product found by a name typed in any case and without accents, and says what it could not add", async () => {
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

    const field = page.getByRole("combobox", { name: "Producto" });
    const cafe = page.getByRole("listitem").filter({ hasText: "Café molido 500 g" });

    await field.fill("CAFE mol");
    await page.getByRole("option", { name: /Café molido 500 g/ }).waitFor();
    await page.getByText("$ 2.380,00 / u").waitFor();
    await field.press("Enter");
    await cafe.getByText("$ 2.380,00").waitFor();
    expect(await field.inputValue()).toBe("");

    await field.fill("zzz");
    await page.getByText("Sin resultados").waitFor();
    expect(await field.inputValue()).toBe("zzz");

    await field.fill("alfaj");
    await page.getByRole("option", { name: /Alfajor triple/ }).click();
    await page.getByText("Alfajor triple no tiene precio").waitFor();
  });
});
