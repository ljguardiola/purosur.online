import type {
  AddProductOutcome,
  ApplySaleDiscountOutcome,
  ChangeLineQuantityOutcome,
  ChangeLineWeightOutcome,
  OpenSale,
  PreviewSaleDiscountOutcome,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
} from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  QUESO,
  renderScreen,
  SALE_OF_QUESO,
  SALE_OF_YERBA,
  SALE_OF_YERBA_AND_ALFAJOR,
  scan,
  YERBA,
} from "./test-support/sale-screen";

const OPEN_DISCOUNT = "Aplicar descuento al total";
const DISCOUNTED_SALE: OpenSale = {
  ...SALE_OF_YERBA,
  sale_discount: { kind: "PERCENT", value: 5, amount: 23_800 },
  total: 452_200,
  pending: 452_200,
};
const THREE_YERBAS: OpenSale = {
  ...SALE_OF_YERBA,
  lines: [{ ...YERBA, quantity: 3, line_total: 714_000 }],
  subtotal: 714_000,
  total: 714_000,
  pending: 714_000,
};
const REMOVED_TITLE = "Se quitó el descuento sobre el total porque cambió una línea";
const REMOVED_HELP = "Volvé a aplicarlo si corresponde.";

async function applyFivePercent(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Porcentaje de descuento" }), "5");
  await userEvent.fill(screen.getByRole("textbox", { name: "Motivo" }), "Cliente frecuente");
  await userEvent.click(screen.getByRole("button", { name: "Aplicar el descuento" }));
}

describe("SaleScreen showing the discount on the total", () => {
  it("says the sale has no discount on the total", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });

    await expect.element(screen.getByText("Sin aplicar")).toBeVisible();
  });

  it("shows the discount the sale has, and charges the total the core answers", async () => {
    const { screen } = await renderScreen({ currentSale: async () => DISCOUNTED_SALE });

    await expect.element(screen.getByText("Descuento sobre el total · 5 %")).toBeVisible();
    await expect.element(screen.getByText("− $ 238,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.522,00").first()).toBeVisible();
  });

  it("says nothing of the discount on the total while the sale loads", async () => {
    const { screen } = await renderScreen({ currentSale: () => new Promise(() => {}) });

    await expect.element(screen.getByText("Cargando…").first()).toBeInTheDocument();
    await expect.element(screen.getByText("Sin aplicar")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: OPEN_DISCOUNT }))
      .not.toBeInTheDocument();
  });

  it("says nothing of the discount on the total once the sale cannot be read", async () => {
    const { screen } = await renderScreen({
      currentSale: () => Promise.reject(new Error("unavailable")),
    });

    await expect.element(screen.getByText("No se pudo cargar la venta")).toBeVisible();
    await expect.element(screen.getByText("Sin aplicar")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: OPEN_DISCOUNT }))
      .not.toBeInTheDocument();
  });

  it("offers the discount only once the sale has a line that can change", async () => {
    const { screen } = await renderScreen({ currentSale: async () => null });

    await expect.element(screen.getByRole("button", { name: OPEN_DISCOUNT })).toBeDisabled();
  });

  it("offers no discount on a sale the core says cannot be discounted", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...SALE_OF_YERBA, sale_discount_refusal: "zero_total" }),
    });

    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: OPEN_DISCOUNT })).toBeDisabled();
  });

  it("offers no discount while the lines are locked", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...SALE_OF_YERBA, lines_lock: "approved_payment" }),
    });

    await expect.element(screen.getByRole("button", { name: OPEN_DISCOUNT })).toBeDisabled();
  });
});

describe("SaleScreen applying a discount on the total", () => {
  it("opens the modal naming the lines of the sale", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR });

    await screen.getByRole("button", { name: OPEN_DISCOUNT }).click();

    await expect
      .element(screen.getByRole("dialog", { name: "Descuento sobre el total" }))
      .toBeVisible();
    await expect.element(screen.getByText("VENTA EN CURSO · 2 LÍNEAS")).toBeVisible();
  });

  it("sends the discount to the core, shows the sale it answers and closes the modal", async () => {
    const applySaleDiscount = vi.fn(
      async (): Promise<ApplySaleDiscountOutcome> => ({ kind: "applied", sale: DISCOUNTED_SALE }),
    );
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      applySaleDiscount,
    });
    await screen.getByRole("button", { name: OPEN_DISCOUNT }).click();

    await applyFivePercent(screen);

    expect(applySaleDiscount).toHaveBeenCalledExactlyOnceWith(
      { kind: "PERCENT", value: 5 },
      "Cliente frecuente",
      undefined,
    );
    await expect.element(screen.getByText("Descuento sobre el total · 5 %")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks the core what the typed discount would leave the sale at and shows its answer", async () => {
    const previewSaleDiscount = vi.fn(
      async (): Promise<PreviewSaleDiscountOutcome> => ({
        kind: "preview",
        subtotal: 476_000,
        discount_amount: 23_800,
        total: 452_200,
      }),
    );
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      previewSaleDiscount,
    });
    await screen.getByRole("button", { name: OPEN_DISCOUNT }).click();

    await userEvent.fill(screen.getByRole("textbox", { name: "Porcentaje de descuento" }), "5");

    expect(previewSaleDiscount).toHaveBeenLastCalledWith({ kind: "PERCENT", value: 5 });
    await expect.element(screen.getByText("− $ 238,00")).toBeVisible();
  });

  it("asks someone with permission to authorize it when the sale requires it", async () => {
    const loadAuthorizers = vi.fn(async () => [{ id: "u3", first_name: "Sofía" }]);
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...SALE_OF_YERBA, sale_discount_authorization_required: true }),
      loadAuthorizers,
    });

    await screen.getByRole("button", { name: OPEN_DISCOUNT }).click();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
    expect(loadAuthorizers).toHaveBeenCalledWith("apply_total_discount");
  });

  it("closes the modal and reads the sale again when the sale is gone", async () => {
    const currentSale = vi.fn(async () => SALE_OF_YERBA);
    const { screen } = await renderScreen({
      currentSale,
      applySaleDiscount: async () => ({ kind: "no_open_sale" }),
    });
    await screen.getByRole("button", { name: OPEN_DISCOUNT }).click();

    await applyFivePercent(screen);

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.poll(() => currentSale.mock.calls.length).toBe(2);
  });

  it("tells the app when nobody is signed in any more", async () => {
    const onSessionInvalid = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      applySaleDiscount: async () => ({ kind: "not_signed_in" }),
      onSessionInvalid,
    });
    await screen.getByRole("button", { name: OPEN_DISCOUNT }).click();

    await applyFivePercent(screen);

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });

  it("closes the modal from Volver", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });
    await screen.getByRole("button", { name: OPEN_DISCOUNT }).click();

    await screen.getByRole("button", { name: "Volver" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("SaleScreen telling the discount on the total was removed", () => {
  it("tells it when changing a quantity removed it", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => DISCOUNTED_SALE,
      changeLineQuantity: async (): Promise<ChangeLineQuantityOutcome> => ({
        kind: "changed",
        removed_manual_discount: false,
        removed_sale_discount: true,
        sale: THREE_YERBAS,
      }),
    });

    await screen.getByRole("button", { name: "Subir la cantidad de Yerba mate 1 kg" }).click();

    await expect.element(screen.getByText(REMOVED_TITLE)).toBeVisible();
    await expect.element(screen.getByText(REMOVED_HELP)).toBeVisible();
  });

  it("says nothing when the change kept it", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => DISCOUNTED_SALE,
      changeLineQuantity: async (): Promise<ChangeLineQuantityOutcome> => ({
        kind: "changed",
        removed_manual_discount: false,
        removed_sale_discount: false,
        sale: THREE_YERBAS,
      }),
    });

    await screen.getByRole("button", { name: "Subir la cantidad de Yerba mate 1 kg" }).click();

    await expect.element(screen.getByText("3", { exact: true })).toBeVisible();
    await expect.element(screen.getByText(REMOVED_TITLE)).not.toBeInTheDocument();
  });

  it("tells it when removing a line removed it", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => ({
        ...SALE_OF_YERBA_AND_ALFAJOR,
        sale_discount: DISCOUNTED_SALE.sale_discount,
      }),
      removeSaleLine: async (): Promise<RemoveSaleLineOutcome> => ({
        kind: "removed",
        sale: SALE_OF_YERBA,
        removed_sale_discount: true,
      }),
    });

    await screen.getByRole("button", { name: "Quitar Alfajor triple" }).click();

    await expect.element(screen.getByText(REMOVED_TITLE)).toBeVisible();
  });

  it("tells it when scanning a product removed it", async () => {
    const { screen, field } = await renderScreen({
      currentSale: async () => DISCOUNTED_SALE,
      scanProduct: async (): Promise<ScanProductOutcome> => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: true,
        sale: THREE_YERBAS,
      }),
    });

    await scan(field, "7790001");

    await expect.element(screen.getByText(REMOVED_TITLE)).toBeVisible();
  });

  it("tells it when choosing a product removed it", async () => {
    const { screen, field } = await renderScreen({
      currentSale: async () => DISCOUNTED_SALE,
      searchProducts: async () => ({
        kind: "results",
        products: [
          {
            product_id: "p1",
            name: "Yerba mate 1 kg",
            sale_unit: "UNIT",
            unit_price: 238_000,
            matches: [],
          },
        ],
        more: false,
      }),
      addProduct: async (): Promise<AddProductOutcome> => ({
        kind: "added",
        removed_manual_discount: false,
        removed_sale_discount: true,
        sale: THREE_YERBAS,
      }),
    });

    await field.fill("yerba");
    await screen.getByRole("option", { name: /Yerba mate 1 kg/ }).click();

    await expect.element(screen.getByText(REMOVED_TITLE)).toBeVisible();
  });

  it("tells it when changing the weight of a line removed it", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...SALE_OF_QUESO, sale_discount: DISCOUNTED_SALE.sale_discount }),
      changeLineWeight: async (): Promise<ChangeLineWeightOutcome> => ({
        kind: "changed",
        removed_manual_discount: false,
        removed_sale_discount: true,
        sale: { ...SALE_OF_QUESO, lines: [QUESO] },
      }),
    });
    await screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }).click();

    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("1");
    await screen.getByRole("button", { name: "Cambiar peso" }).click();

    await expect.element(screen.getByText(REMOVED_TITLE)).toBeVisible();
  });

  it("tells it, with the line's, when a change removed both discounts", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => DISCOUNTED_SALE,
      changeLineQuantity: async (): Promise<ChangeLineQuantityOutcome> => ({
        kind: "changed",
        removed_manual_discount: true,
        removed_sale_discount: true,
        sale: THREE_YERBAS,
      }),
    });

    await screen.getByRole("button", { name: "Subir la cantidad de Yerba mate 1 kg" }).click();

    await expect
      .element(
        screen.getByText(
          "Se quitaron el descuento manual de Yerba mate 1 kg y el descuento sobre el total porque cambió la cantidad",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText(REMOVED_HELP)).toBeVisible();
  });

  it("tells it when adjusting a line removed it", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => DISCOUNTED_SALE,
      adjustSaleLine: async () => ({
        kind: "changed",
        sale: { ...SALE_OF_YERBA, subtotal: 428_400, total: 428_400, pending: 428_400 },
        removed_sale_discount: true,
      }),
    });
    await screen.getByRole("button", { name: "Cambiar el precio de Yerba mate 1 kg" }).click();
    await userEvent.fill(screen.getByRole("textbox", { name: "Porcentaje de descuento" }), "10");
    await userEvent.fill(screen.getByRole("textbox", { name: "Motivo" }), "Envase dañado");

    await userEvent.click(screen.getByRole("button", { name: "Aplicar el descuento" }));

    await expect.element(screen.getByText(REMOVED_TITLE)).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });
});
