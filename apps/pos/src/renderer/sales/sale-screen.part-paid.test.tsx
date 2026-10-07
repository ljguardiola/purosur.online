import type {
  AddProductOutcome,
  ChangeLineQuantityOutcome,
  CurrentSaleAnswer,
  OpenSale,
  RemoveSaleLineOutcome,
  ScanProductOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { renderScreen, SALE_OF_YERBA, scan, YERBA } from "./test-support/sale-screen";

const SALE_WITH_PAYMENT: OpenSale = {
  ...SALE_OF_YERBA,
  paid: 100_000,
  pending: 376_000,
  lines_editable: false,
  cancellable: false,
};
const LOCKED_REASON = "La venta ya no se puede cambiar porque tiene un pago aprobado.";
const REFUSAL_TITLE = "No se puede cambiar la venta";
const LOCKED_NOTICE = "La venta ya no se puede cambiar";

function readingFirst(before: OpenSale, after: OpenSale): () => Promise<CurrentSaleAnswer> {
  const reads = [before];
  return async () => reads.shift() ?? after;
}

describe("SaleScreen with a sale that already has an approved payment", () => {
  it("explains on the scan field, not in a line under it, that the sale can no longer be changed", async () => {
    const { screen, field } = await renderScreen({ currentSale: async () => SALE_WITH_PAYMENT });

    await expect.element(field).toHaveAccessibleDescription(LOCKED_REASON);
    await expect.element(screen.getByText(LOCKED_NOTICE, { exact: true })).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(document.body);
  });

  it("shows what is paid and what is pending, and still offers to charge the rest", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_WITH_PAYMENT });

    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("Pagado")).toBeVisible();
    await expect.element(panel.getByText("$ 1.000,00")).toBeVisible();
    await expect.element(panel.getByText("Saldo pendiente")).toBeVisible();
    await expect.element(panel.getByText("$ 3.760,00")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cobrar" })).toBeEnabled();
  });

  it("offers no way to cancel the sale", async () => {
    const { screen, field } = await renderScreen({ currentSale: async () => SALE_WITH_PAYMENT });

    await expect.element(field).toHaveAccessibleDescription(LOCKED_REASON);
    await expect
      .element(screen.getByRole("button", { name: "Cancelar venta" }))
      .not.toBeInTheDocument();
  });

  it("offers no way to add, change or remove a line", async () => {
    const { screen, field } = await renderScreen({ currentSale: async () => SALE_WITH_PAYMENT });

    await expect.element(field).toHaveAttribute("aria-disabled", "true");
    await expect
      .element(screen.getByRole("button", { name: "Quitar Yerba mate 1 kg" }))
      .toHaveAttribute("aria-disabled", "true");
  });

  it("explains no lock, shows no payment rows and still offers to cancel while nothing is paid", async () => {
    const { screen, field } = await renderScreen({ currentSale: async () => SALE_OF_YERBA });

    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    await expect.element(field).not.toHaveAccessibleDescription(LOCKED_REASON);
    await expect.element(screen.getByText("Saldo pendiente")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Cancelar venta" })).toBeEnabled();
  });

  it("explains it once, and reads the sale again, when a scan is refused because the sale has payments", async () => {
    const scanProduct = vi.fn(
      async (): Promise<ScanProductOutcome> => ({ kind: "sale_has_payments" }),
    );
    const { screen, field } = await renderScreen({
      currentSale: readingFirst(SALE_OF_YERBA, SALE_WITH_PAYMENT),
      scanProduct,
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    await scan(field, "7790001");

    await expect.element(screen.getByText(REFUSAL_TITLE)).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cancelar venta" }))
      .not.toBeInTheDocument();
    await expect.element(field).toBeDisabled();
    await expect.element(field).not.toHaveAccessibleDescription(LOCKED_REASON);
    await expect.element(screen.getByRole("tooltip")).not.toBeInTheDocument();
    await expect.element(screen.getByText(LOCKED_NOTICE, { exact: true })).not.toBeInTheDocument();
  });

  it("explains it when a chosen product is refused because the sale has payments", async () => {
    const { screen, field } = await renderScreen({
      currentSale: readingFirst(SALE_OF_YERBA, SALE_WITH_PAYMENT),
      searchProducts: async () => ({
        kind: "results",
        products: [
          {
            product_id: "p9",
            name: "Fideos",
            sale_unit: "UNIT",
            unit_price: 90_000,
            matches: [],
          },
        ],
        more: false,
      }),
      addProduct: async (): Promise<AddProductOutcome> => ({ kind: "sale_has_payments" }),
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();

    await field.fill("Fideos");
    await userEvent.keyboard("{Enter}");

    await expect.element(screen.getByText(REFUSAL_TITLE)).toBeVisible();
  });

  it.each([
    [
      "raising a quantity",
      "Subir la cantidad de Yerba mate 1 kg",
      {
        changeLineQuantity: async (): Promise<ChangeLineQuantityOutcome> => ({
          kind: "sale_has_payments",
        }),
      },
    ],
    [
      "removing a line",
      "Quitar Yerba mate 1 kg",
      {
        removeSaleLine: async (): Promise<RemoveSaleLineOutcome> => ({ kind: "sale_has_payments" }),
      },
    ],
  ])(
    "explains it once when %s is refused because the sale has payments",
    async (_, button, edit) => {
      const { screen } = await renderScreen({
        currentSale: readingFirst({ ...SALE_OF_YERBA, lines: [YERBA] }, SALE_WITH_PAYMENT),
        ...edit,
      });

      await screen.getByRole("button", { name: button }).click();

      await expect.element(screen.getByText(REFUSAL_TITLE)).toBeVisible();
      await expect.element(screen.getByRole("button", { name: button })).toBeDisabled();
      await expect.element(screen.getByRole("tooltip")).not.toBeInTheDocument();
      await expect
        .element(screen.getByText(LOCKED_NOTICE, { exact: true }))
        .not.toBeInTheDocument();
    },
  );
});
