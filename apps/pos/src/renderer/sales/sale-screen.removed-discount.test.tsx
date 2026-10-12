import type {
  AddProductOutcome,
  ChangeLineQuantityOutcome,
  ChangeLineWeightOutcome,
  OpenSale,
  ScanProductOutcome,
} from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  QUESO,
  renderScreen,
  SALE_OF_QUESO,
  SALE_OF_YERBA,
  scan,
  YERBA,
} from "./test-support/sale-screen";

const DISCOUNTED_YERBA = {
  ...YERBA,
  discount_amount: 47_600,
  manual_adjustment: {
    kind: "AMOUNT" as const,
    value: 47_600,
  },
  line_total: 428_400,
};
const DISCOUNTED_SALE: OpenSale = { ...SALE_OF_YERBA, lines: [DISCOUNTED_YERBA] };
const THREE_YERBAS: OpenSale = {
  ...SALE_OF_YERBA,
  lines: [{ ...YERBA, quantity: 3, line_total: 714_000 }],
  total: 714_000,
  pending: 714_000,
};
const REMOVED_TITLE = "Se quitó el descuento manual de Yerba mate 1 kg porque cambió la cantidad";
const REMOVED_HELP = "Volvé a aplicarlo si corresponde.";

describe("SaleScreen telling the manual discount was removed", () => {
  it("tells it when raising the quantity removed the line's manual discount", async () => {
    const { screen } = await renderScreen({
      currentSale: async () => DISCOUNTED_SALE,
      changeLineQuantity: async (): Promise<ChangeLineQuantityOutcome> => ({
        kind: "changed",
        removed_manual_discount: true,
        removed_sale_discount: false,
        sale: THREE_YERBAS,
      }),
    });

    await screen.getByRole("button", { name: "Subir la cantidad de Yerba mate 1 kg" }).click();

    await expect.element(screen.getByText(REMOVED_TITLE)).toBeVisible();
    await expect.element(screen.getByText(REMOVED_HELP)).toBeVisible();
  });

  it("says nothing when the quantity change kept the line's discount", async () => {
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

  it("tells it when scanning a product already on the sale removed its line's manual discount", async () => {
    const scanProduct = vi.fn(
      async (): Promise<ScanProductOutcome> => ({
        kind: "added",
        removed_manual_discount: true,
        removed_sale_discount: false,
        sale: THREE_YERBAS,
      }),
    );
    const { screen, field } = await renderScreen({
      currentSale: async () => DISCOUNTED_SALE,
      scanProduct,
    });

    await scan(field, "7790001");

    await expect.element(screen.getByText(REMOVED_TITLE)).toBeVisible();
    await expect.element(screen.getByText(REMOVED_HELP)).toBeVisible();
  });

  it("tells it when choosing a product already on the sale removed its line's manual discount", async () => {
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
        removed_manual_discount: true,
        removed_sale_discount: false,
        sale: THREE_YERBAS,
      }),
    });

    await field.fill("yerba");
    await screen.getByRole("option", { name: /Yerba mate 1 kg/ }).click();

    await expect.element(screen.getByText(REMOVED_TITLE)).toBeVisible();
  });

  it("tells it when changing the weight of a line removed its manual discount", async () => {
    const discounted: OpenSale = {
      ...SALE_OF_QUESO,
      lines: [
        {
          ...QUESO,
          discount_amount: 100_000,
          manual_adjustment: {
            kind: "AMOUNT",
            value: 100_000,
          },
          line_total: 1_462_500,
        },
      ],
    };
    const { screen } = await renderScreen({
      currentSale: async () => discounted,
      changeLineWeight: async (): Promise<ChangeLineWeightOutcome> => ({
        kind: "changed",
        removed_manual_discount: true,
        removed_sale_discount: false,
        sale: SALE_OF_QUESO,
      }),
    });
    await screen.getByRole("button", { name: "Cambiar el peso de Queso cremoso" }).click();

    await screen.getByRole("textbox", { name: "Peso en kg" }).fill("1");
    await screen.getByRole("button", { name: "Cambiar peso" }).click();

    await expect
      .element(
        screen.getByText("Se quitó el descuento manual de Queso cremoso porque cambió la cantidad"),
      )
      .toBeVisible();
  });
});
