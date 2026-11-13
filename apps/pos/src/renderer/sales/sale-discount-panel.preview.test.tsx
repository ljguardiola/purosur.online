import type { PreviewSaleDiscountOutcome } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseOption,
  FIVE_PERCENT,
  renderSaleDiscountPanel,
  typeValue,
} from "./test-support/sale-discount-panel";

describe("SaleDiscountPanel previewing the discount", () => {
  it("shows a placeholder in each row before anything is typed, asking the core nothing", async () => {
    const { screen, preview } = await renderSaleDiscountPanel();

    await expect.element(screen.getByText("TOTAL", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Antes", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 50.700,00", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Descuento", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("—")).toHaveLength(2);
    expect(preview).not.toHaveBeenCalled();
  });

  it("shows exactly the discount and the total the core answers, naming the typed percentage", async () => {
    const { screen, preview } = await renderSaleDiscountPanel({
      previewSaleDiscount: async () => FIVE_PERCENT,
    });

    await typeValue(screen, "DESCUENTO", "5");

    await expect.element(screen.getByText("Descuento 5 %", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("– $ 2.535,00")).toBeVisible();
    await expect.element(screen.getByText("$ 48.165,00")).toBeVisible();
    expect(preview).toHaveBeenLastCalledWith({ kind: "PERCENT", value: 5 });
  });

  it("asks again, in cents, when an amount is typed", async () => {
    const { screen, preview } = await renderSaleDiscountPanel({
      previewSaleDiscount: async () => ({
        kind: "preview",
        subtotal: 5_070_000,
        discount_amount: 270_000,
        total: 4_800_000,
      }),
    });
    await chooseOption(screen, "$");

    await typeValue(screen, "DESCUENTO", "2700");

    await expect.element(screen.getByText("Descuento", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("– $ 2.700,00")).toBeVisible();
    await expect.element(screen.getByText("$ 48.000,00")).toBeVisible();
    expect(preview).toHaveBeenLastCalledWith({ kind: "AMOUNT", value: 270_000 });
  });

  it("does not ask the core while the value is not valid", async () => {
    const { screen, preview } = await renderSaleDiscountPanel({
      previewSaleDiscount: async () => FIVE_PERCENT,
    });

    await typeValue(screen, "DESCUENTO", "5,5");

    await expect.element(screen.getByText("—")).toHaveLength(2);
    expect(preview).not.toHaveBeenCalled();
  });

  it("goes back to the placeholders when the value is cleared", async () => {
    const { screen } = await renderSaleDiscountPanel({
      previewSaleDiscount: async () => FIVE_PERCENT,
    });
    await typeValue(screen, "DESCUENTO", "5");
    await expect.element(screen.getByText("– $ 2.535,00")).toBeVisible();

    await typeValue(screen, "DESCUENTO", "");

    await expect.element(screen.getByText("– $ 2.535,00")).not.toBeInTheDocument();
    await expect.element(screen.getByText("—")).toHaveLength(2);
  });

  it("says the discount is above the sale's total when the core refuses it", async () => {
    const { screen } = await renderSaleDiscountPanel({
      previewSaleDiscount: async () => ({ kind: "discount_exceeds_sale" }),
    });
    await chooseOption(screen, "$");

    await typeValue(screen, "DESCUENTO", "99999");

    await expect
      .element(screen.getByText("El descuento no puede ser mayor al total de la venta."))
      .toBeVisible();
    await expect.element(screen.getByText("—")).toHaveLength(2);
  });

  it.each<PreviewSaleDiscountOutcome>([
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "no_open_sale" },
    { kind: "no_open_session" },
    { kind: "sale_has_payments" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
  ])("keeps the placeholders when the core answers $kind", async (outcome) => {
    const { screen, preview } = await renderSaleDiscountPanel({
      previewSaleDiscount: async () => outcome,
    });

    await typeValue(screen, "DESCUENTO", "5");

    await expect.poll(() => preview.mock.calls.length).toBe(1);
    await expect.element(screen.getByText("—")).toHaveLength(2);
  });

  it.each<[string, () => Promise<PreviewSaleDiscountOutcome>]>([
    ["cannot be reached", () => Promise.reject(new Error("the connection was replaced"))],
    ["answers it is unavailable", async () => ({ kind: "unavailable" })],
  ])("says the preview could not be calculated when the core %s", async (_what, failing) => {
    const { screen } = await renderSaleDiscountPanel({ previewSaleDiscount: failing });

    await typeValue(screen, "DESCUENTO", "5");

    await expect.element(screen.getByText("No se pudo calcular cómo queda la venta")).toBeVisible();
  });

  it("groups thousands and takes a typed dot as the decimal comma in an amount discount", async () => {
    const { screen } = await renderSaleDiscountPanel();
    await chooseOption(screen, "$");
    const field = screen.getByRole("textbox", { name: "DESCUENTO" });
    await userEvent.clear(field);
    await userEvent.type(field, "1234.5");

    await expect.element(field).toHaveValue("1.234,5");
  });
});
