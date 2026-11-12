import type { PreviewSaleLineAdjustmentOutcome } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseOption,
  renderLinePricePanel,
  TEN_PERCENT,
  typePrice,
  typeValue,
} from "./test-support/line-price-panel";
import { deferred } from "./test-support/sale-screen";

const NOT_PREVIEWED = "—";

describe("LinePricePanel previewing the adjustment", () => {
  it("shows no remaining total and no difference before anything is typed", async () => {
    const { screen, preview } = await renderLinePricePanel();

    await expect.element(screen.getByText("QUEDA EN")).toBeVisible();
    await expect.element(screen.getByText(NOT_PREVIEWED)).toHaveLength(2);
    expect(preview).not.toHaveBeenCalled();
  });

  it("shows exactly the total and the difference the core answers for a typed percentage", async () => {
    const { screen, preview } = await renderLinePricePanel({
      previewAdjustment: async () => TEN_PERCENT,
    });
    await chooseOption(screen, "Descuento %");

    await typeValue(screen, "DESCUENTO", "10");

    await expect.element(screen.getByText("– $ 476,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.284,00")).toBeVisible();
    expect(preview).toHaveBeenLastCalledWith("line-1", { kind: "PERCENT", value: 10 });
  });

  it("asks again, in cents, when the amount of the discount is typed", async () => {
    const { screen, preview } = await renderLinePricePanel({
      previewAdjustment: async () => ({
        kind: "preview",
        discount_amount: 50_000,
        line_total: 426_000,
      }),
    });
    await chooseOption(screen, "Descuento $");

    await typeValue(screen, "DESCUENTO", "500");

    await expect.element(screen.getByText("– $ 500,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.260,00")).toBeVisible();
    expect(preview).toHaveBeenLastCalledWith("line-1", { kind: "AMOUNT", value: 50_000 });
  });

  it("asks for the typed new price", async () => {
    const { screen, preview } = await renderLinePricePanel({
      previewAdjustment: async () => ({
        kind: "preview",
        discount_amount: 0,
        line_total: 600_000,
      }),
    });

    await typePrice(screen, "3000");

    await expect.element(screen.getByText("$ 6.000,00")).toBeVisible();
    expect(preview).toHaveBeenLastCalledWith("line-1", { kind: "PRICE", value: 300_000 });
  });

  it("does not ask the core while the value is not valid", async () => {
    const { screen, preview } = await renderLinePricePanel({
      previewAdjustment: async () => TEN_PERCENT,
    });
    await chooseOption(screen, "Descuento %");

    await typeValue(screen, "DESCUENTO", "10,5");

    await expect.element(screen.getByText(NOT_PREVIEWED)).toHaveLength(2);
    expect(preview).not.toHaveBeenCalled();
  });

  it("goes back to the placeholders when the value is cleared", async () => {
    const { screen } = await renderLinePricePanel({ previewAdjustment: async () => TEN_PERCENT });
    await chooseOption(screen, "Descuento %");
    await typeValue(screen, "DESCUENTO", "10");
    await expect.element(screen.getByText("– $ 476,00")).toBeVisible();

    await typeValue(screen, "DESCUENTO", "");

    await expect.element(screen.getByText("– $ 476,00")).not.toBeInTheDocument();
    await expect.element(screen.getByText(NOT_PREVIEWED)).toHaveLength(2);
  });

  it("says the price is the list price when the core refuses it", async () => {
    const { screen } = await renderLinePricePanel({
      previewAdjustment: async () => ({ kind: "same_as_list_price" }),
    });

    await typePrice(screen, "2380");

    await expect
      .element(screen.getByText("Ese es el precio de lista. Ingresá otro precio."))
      .toBeVisible();
    await expect.element(screen.getByText(NOT_PREVIEWED)).toHaveLength(2);
  });

  it("says the discount is above the line's total when the core refuses it", async () => {
    const { screen } = await renderLinePricePanel({
      previewAdjustment: async () => ({ kind: "discount_exceeds_line" }),
    });
    await chooseOption(screen, "Descuento $");

    await typeValue(screen, "DESCUENTO", "9999");

    await expect
      .element(screen.getByText("El descuento no puede ser mayor al total de la línea."))
      .toBeVisible();
    await expect.element(screen.getByText(NOT_PREVIEWED)).toHaveLength(2);
  });

  it.each<PreviewSaleLineAdjustmentOutcome>([
    { kind: "unknown_line" },
    { kind: "no_open_sale" },
    { kind: "no_open_session" },
    { kind: "sale_has_payments" },
    { kind: "not_permitted" },
    { kind: "not_signed_in" },
  ])("keeps the placeholders when the core answers $kind", async (outcome) => {
    const { screen, preview } = await renderLinePricePanel({
      previewAdjustment: async () => outcome,
    });

    await typePrice(screen, "10");

    await expect.poll(() => preview.mock.calls.length).toBe(1);
    await expect.element(screen.getByText(NOT_PREVIEWED)).toHaveLength(2);
  });

  it("shows the preview loading in place of the total and the difference until the core answers", async () => {
    const answer = deferred<PreviewSaleLineAdjustmentOutcome>();
    const { screen } = await renderLinePricePanel({ previewAdjustment: () => answer.promise });

    await typePrice(screen, "3000");

    await expect.element(screen.getByText("Diferencia")).not.toBeInTheDocument();
    await expect.element(screen.getByText(NOT_PREVIEWED)).not.toBeInTheDocument();
    answer.resolve(TEN_PERCENT);
    await expect.element(screen.getByText("$ 4.284,00")).toBeVisible();
    await expect.element(screen.getByText("Diferencia")).toBeVisible();
  });

  it.each<[string, () => Promise<PreviewSaleLineAdjustmentOutcome>]>([
    ["cannot be reached", () => Promise.reject(new Error("the connection was replaced"))],
    ["answers it is unavailable", async () => ({ kind: "unavailable" })],
  ])("says the preview could not be calculated when the core %s", async (_what, failing) => {
    const { screen } = await renderLinePricePanel({ previewAdjustment: failing });

    await typePrice(screen, "3000");

    await expect.element(screen.getByText("No se pudo calcular cómo queda la línea")).toBeVisible();
  });

  it("shows the preview loading again after Reintentar, until the core answers", async () => {
    const retried = deferred<PreviewSaleLineAdjustmentOutcome>();
    const answers = [
      () => Promise.reject(new Error("the connection was replaced")),
      () => retried.promise,
    ];
    const { screen } = await renderLinePricePanel({
      previewAdjustment: () => {
        const next = answers.shift();
        if (next === undefined) {
          throw new Error("no answer left");
        }
        return next();
      },
    });
    await typePrice(screen, "3000");
    await expect.element(screen.getByText("No se pudo calcular cómo queda la línea")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect
      .element(screen.getByText("No se pudo calcular cómo queda la línea"))
      .not.toBeInTheDocument();
    retried.resolve(TEN_PERCENT);
    await expect.element(screen.getByText("$ 4.284,00")).toBeVisible();
  });

  it("groups thousands and takes a typed dot as the decimal comma in a new price", async () => {
    const { screen } = await renderLinePricePanel();
    const field = screen.getByRole("textbox", { name: "PRECIO NUEVO POR UNIDAD" });
    await userEvent.clear(field);
    await userEvent.type(field, "1234.5");

    await expect.element(field).toHaveValue("1.234,5");
  });
});
