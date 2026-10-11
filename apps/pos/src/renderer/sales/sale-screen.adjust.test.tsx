import type {
  AdjustSaleLineOutcome,
  OpenSale,
  PreviewSaleLineAdjustmentOutcome,
} from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { renderScreen, SALE_OF_YERBA, YERBA } from "./test-support/sale-screen";

const OPEN_ADJUSTMENT = "Cambiar el precio de Yerba mate 1 kg";
const DISCOUNTED_SALE: OpenSale = {
  ...SALE_OF_YERBA,
  lines: [
    {
      ...YERBA,
      discount_amount: 47_600,
      manual_adjustment: {
        kind: "PERCENT",
        value: 10,
      },
      line_total: 428_400,
    },
  ],
  total: 428_400,
  pending: 428_400,
};
const CHANGED: AdjustSaleLineOutcome = { kind: "changed", sale: DISCOUNTED_SALE };

async function applyTenPercent(screen: Awaited<ReturnType<typeof renderScreen>>["screen"]) {
  await userEvent.fill(screen.getByRole("textbox", { name: "Porcentaje de descuento" }), "10");
  await userEvent.fill(screen.getByRole("textbox", { name: "Motivo" }), "Envase dañado");
  await userEvent.click(screen.getByRole("button", { name: "Aplicar el descuento" }));
}

describe("SaleScreen adjusting a line's price or discount", () => {
  it("opens the modal of the line it is asked on, naming the line", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });

    await screen.getByRole("button", { name: OPEN_ADJUSTMENT }).click();

    await expect
      .element(screen.getByRole("dialog", { name: "Cambiar el precio de la línea" }))
      .toBeVisible();
    await expect.element(screen.getByText("YERBA MATE 1 KG · 2 U")).toBeVisible();
  });

  it("sends the line and the adjustment to the core, shows the sale it answers and closes the modal", async () => {
    const adjustSaleLine = vi.fn(async (): Promise<AdjustSaleLineOutcome> => CHANGED);
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      adjustSaleLine,
    });
    await screen.getByRole("button", { name: OPEN_ADJUSTMENT }).click();

    await applyTenPercent(screen);

    expect(adjustSaleLine).toHaveBeenCalledExactlyOnceWith(
      YERBA.id,
      { kind: "PERCENT", value: 10 },
      "Envase dañado",
      undefined,
    );
    await expect.element(screen.getByText("Descuento manual 10 %")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks the core what the typed discount would leave the line at and shows its answer", async () => {
    const previewSaleLineAdjustment = vi.fn(
      async (): Promise<PreviewSaleLineAdjustmentOutcome> => ({
        kind: "preview",
        discount_amount: 47_600,
        line_total: 428_400,
      }),
    );
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      previewSaleLineAdjustment,
    });
    await screen.getByRole("button", { name: OPEN_ADJUSTMENT }).click();

    await userEvent.fill(screen.getByRole("textbox", { name: "Porcentaje de descuento" }), "10");

    expect(previewSaleLineAdjustment).toHaveBeenLastCalledWith(YERBA.id, {
      kind: "PERCENT",
      value: 10,
    });
    await expect.element(screen.getByText("− $ 476,00")).toBeVisible();
    await expect.element(screen.getByText("$ 4.284,00")).toBeVisible();
  });

  it("asks nobody to authorize it when the sale does not require it", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });

    await screen.getByRole("button", { name: OPEN_ADJUSTMENT }).click();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).not.toBeInTheDocument();
  });

  it("asks someone with permission to authorize it when the sale requires it", async () => {
    const loadAuthorizers = vi.fn(async () => [{ id: "u3", first_name: "Sofía" }]);
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...SALE_OF_YERBA, adjust_authorization_required: true }),
      loadAuthorizers,
    });

    await screen.getByRole("button", { name: OPEN_ADJUSTMENT }).click();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
    expect(loadAuthorizers).toHaveBeenCalledWith("override_line_price_or_discount");
  });

  it("closes the modal and reads the sale again when the line is gone", async () => {
    const currentSale = vi.fn(async () => SALE_OF_YERBA);
    const { screen } = await renderScreen({
      currentSale,
      adjustSaleLine: async () => ({ kind: "unknown_line" }),
    });
    await screen.getByRole("button", { name: OPEN_ADJUSTMENT }).click();

    await applyTenPercent(screen);

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.poll(() => currentSale.mock.calls.length).toBe(2);
  });

  it("tells the app when nobody is signed in any more", async () => {
    const onSessionInvalid = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      adjustSaleLine: async () => ({ kind: "not_signed_in" }),
      onSessionInvalid,
    });
    await screen.getByRole("button", { name: OPEN_ADJUSTMENT }).click();

    await applyTenPercent(screen);

    await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
  });

  it("closes the modal from Volver without asking the core", async () => {
    const adjustSaleLine = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      adjustSaleLine,
    });
    await screen.getByRole("button", { name: OPEN_ADJUSTMENT }).click();

    await screen.getByRole("button", { name: "Volver" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    expect(adjustSaleLine).not.toHaveBeenCalled();
  });
});
