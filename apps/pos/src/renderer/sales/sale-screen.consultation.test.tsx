import type { AddProductOutcome, SearchProductsOutcome } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { renderScreen, SALE_OF_YERBA, SALE_OF_YERBA_AND_ALFAJOR } from "./test-support/sale-screen";

const ALMENDRAS = {
  product_id: "almendras",
  name: "Almendras peladas",
  sale_unit: "KG" as const,
  unit_price: 1_890_000,
};

describe("SaleScreen opening Consulta", () => {
  it("offers F4 Consulta and opens the mode with no product", async () => {
    const { screen } = await renderScreen({ currentSale: async () => SALE_OF_YERBA_AND_ALFAJOR });
    await expect.element(screen.getByRole("listitem").filter({ hasText: /^F4Consulta$/ })).toBeVisible();

    await userEvent.keyboard("{F4}");

    await vi.waitFor(() =>
      expect(screen.router.state.location).toMatchObject({ pathname: "/consult", search: {} }),
    );
  });

  it("offers F4 Consultar on the products found by name and opens the mode with the chosen one", async () => {
    const searchProducts = vi.fn(
      async (): Promise<SearchProductsOutcome> => ({
        kind: "results",
        products: [{ ...ALMENDRAS, matches: [{ start: 0, length: 3 }] }],
        more: false,
      }),
    );
    const { screen, field } = await renderScreen({ searchProducts });

    await userEvent.fill(field, "alm");
    await expect.element(screen.getByRole("listitem").filter({ hasText: /^F4Consultar$/ })).toBeVisible();
    await userEvent.keyboard("{F4}");

    await vi.waitFor(() =>
      expect(screen.router.state.location).toMatchObject({
        pathname: "/consult",
        search: { product_id: "almendras" },
      }),
    );
  });
});

describe("SaleScreen adding the product Consulta returns with", () => {
  it("adds it to the sale the way a product chosen by name is added, once", async () => {
    const addProduct = vi.fn(
      async (): Promise<AddProductOutcome> => ({
        kind: "added",
        sale: SALE_OF_YERBA,
        removed_manual_discount: false,
        removed_sale_discount: false,
      }),
    );
    const { screen } = await renderScreen({
      addProduct,
      productToAdd: { ...ALMENDRAS, sale_unit: "UNIT", product_id: "p1", name: "Yerba mate 1 kg" },
    });

    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    expect(addProduct).toHaveBeenCalledExactlyOnceWith("p1");
  });

  it("starts weighing a product sold by weight", async () => {
    const addProduct = vi.fn(
      async (): Promise<AddProductOutcome> => ({
        kind: "weight_needed",
        product_id: "almendras",
        product_name: "Almendras peladas",
      }),
    );
    const { screen } = await renderScreen({ addProduct, productToAdd: ALMENDRAS });

    await expect.element(screen.getByText("Almendras peladas")).toBeVisible();
    expect(addProduct).toHaveBeenCalledExactlyOnceWith("almendras");
  });
});
