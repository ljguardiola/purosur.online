import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buyerIdentificationThresholdChange,
  buyerTaxStatusSetChange,
  categoryChange,
  issuerIdentificationChange,
  priceChange,
  priceListChange,
  productChange,
  registerChange,
  registerPointOfSaleChange,
  roleChange,
  userChange,
} from "./test-support/cloud-changes";
import { type EnrolledRegister, enrolledRegister } from "./test-support/enrolled-register";
import { type StandInCloud, startStandInCloud } from "./test-support/stand-in-cloud";
import { until } from "./test-support/until";

const ANA_ID = "5b0b8f4e-3c2d-4a55-9c1e-0a6f6a1d0a11";
const ANA_EMAIL = "ana@example.com";
const YERBA_CODE = "7790001000011";
const POINT_OF_SALE = 3;

describe("authorizing a sale's invoice in real time on the register", () => {
  let cloud: StandInCloud;
  let register: EnrolledRegister;

  beforeAll(async () => {
    cloud = await startStandInCloud(
      [
        registerChange({ id: "register-1", name: "Caja 1" }),
        registerPointOfSaleChange({
          registerId: "register-1",
          number: POINT_OF_SALE,
          taxAuthorityLastAuthorizedNumber: 40,
        }),
        issuerIdentificationChange({
          id: "issuer-1",
          legalName: FICTIONAL_LEGAL_NAME,
          cuit: FICTIONAL_CUIT,
          grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        }),
        buyerTaxStatusSetChange({
          id: "buyer-tax-status-set-1",
          options: [{ code: 5, description: "Consumidor Final", invoiceClass: "B/C" }],
        }),
        roleChange({ id: "role-cashier", name: "Cajero", permissionKeys: ["sell_and_charge"] }),
        await userChange({ id: ANA_ID, firstName: "Ana", roleId: "role-cashier", pin: "4821" }),
        categoryChange({ id: "category-1", name: "Almacén" }),
        productChange({
          id: "product-yerba",
          name: "Yerba mate 1 kg",
          categoryId: "category-1",
          barcodes: [YERBA_CODE],
        }),
        priceListChange({ id: "price-list-1", name: "Mostrador" }),
        buyerIdentificationThresholdChange({
          id: "threshold-1",
          amountCents: 1_000_000_000,
          validFrom: "2026-01-01",
        }),
        priceChange({
          id: "price-yerba",
          productId: "product-yerba",
          priceListId: "price-list-1",
          unitPriceCents: 238_000,
          validFrom: "2026-01-01T00:00:00.000Z",
        }),
      ],
      {
        signInLookups: { [ANA_EMAIL]: { userId: ANA_ID, hasPin: true } },
        taxAuthorityReachable: true,
      },
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

  async function scanYerba(): Promise<void> {
    const { page } = register;
    const scanField = page.getByRole("combobox", { name: "Producto" });
    await scanField.fill(YERBA_CODE);
    await scanField.press("Enter");
    await page
      .getByRole("listitem")
      .filter({ hasText: "Yerba mate 1 kg" })
      .getByText("$ 2.380,00")
      .waitFor();
  }

  it("asks the cloud to authorize the invoice of a sale charged in cash, with the sale behind it", async () => {
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
    await scanYerba();

    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByText("Efectivo", { exact: true }).click();
    await page.getByLabel("Importe entregado por el cliente").fill("2.380,00");
    await page.getByRole("button", { name: "Completar venta" }).click();
    await until(() => cloud.authorizationRequests.length === 1);

    expect(cloud.authorizationRequests[0]).toMatchObject({
      point_of_sale: POINT_OF_SALE,
      number: 41,
      total: 238_000,
      buyer_tax_status_code: 5,
      sale_event: { event_type: "sale_completed" },
    });
    await page.getByRole("heading", { name: "No hay vuelto para entregar" }).waitFor();
    await page.getByRole("button", { name: "Nueva venta" }).click();
    await page.getByText("La venta está vacía").waitFor();
  });

  it("asks for the next number for a sale charged by transfer", async () => {
    const { page } = register;
    await scanYerba();

    await page.getByRole("button", { name: "Cobrar" }).click();
    await page.getByText("Transferencia", { exact: true }).click();
    await page.getByRole("button", { name: "Vi el ingreso" }).click();
    await until(() => cloud.authorizationRequests.length === 2);

    expect(cloud.authorizationRequests[1]).toMatchObject({
      point_of_sale: POINT_OF_SALE,
      number: 42,
      total: 238_000,
    });
  });
});
