import type { PriceProduct } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import {
  createServices,
  renderScreen,
  rice,
  withoutPrice,
} from "./test-support/prices-list-screen";

const withoutCost = { ...rice, id: "product-4", name: "Sal", costReference: null };

const unpricedWithCost = {
  ...withoutPrice,
  costReference: {
    lastCostCents: 100000,
    freightPerUnitCents: 21000,
    totalCostCents: 121000,
    marginTenthsOfPercent: null,
  },
};

async function renderProducts(...products: PriceProduct[]) {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue({
    kind: "ok",
    value: {
      products,
      pendingCount: products.length,
      activeProductCount: products.length,
      reviewWindowDays: 30,
      categories: [],
    },
  });
  return renderScreen(services);
}

test("shows the total cost and the margin as columns of the list", async () => {
  const screen = await renderProducts(rice);

  await expect.element(screen.getByRole("columnheader", { name: "Costo total" })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: "Margen" })).toBeVisible();
});

test("shows a product's total cost with its sale unit and its margin with one decimal", async () => {
  const screen = await renderProducts(rice);

  const row = screen.getByRole("row", { name: /Arroz/ });
  await expect.element(row.getByText("$ 7.500,00 / kg")).toBeVisible();
  await expect.element(row.getByText("$ 4.460,00 / kg")).toBeVisible();
  await expect.element(row.getByText("40,5 %")).toBeVisible();
});

test("shows a negative margin with its minus sign", async () => {
  const screen = await renderProducts({
    ...rice,
    costReference: {
      lastCostCents: 800000,
      freightPerUnitCents: 0,
      totalCostCents: 800000,
      marginTenthsOfPercent: -32,
    },
  });

  await expect
    .element(screen.getByRole("row", { name: /Arroz/ }).getByText("−3,2 %"))
    .toBeVisible();
});

test("shows the cost of a product with no price without a margin", async () => {
  const screen = await renderProducts(unpricedWithCost);

  const row = screen.getByRole("row", { name: /Fideos/ });
  await expect.element(row.getByText("$ 1.210,00")).toBeVisible();
  await expect.poll(() => row.getByText("—").elements()).toHaveLength(2);
});

test("shows a dash for the cost and the margin of a product with no cost", async () => {
  const screen = await renderProducts(withoutCost);

  const row = screen.getByRole("row", { name: /Sal/ });
  await expect.element(row.getByText("$ 7.500,00 / kg")).toBeVisible();
  await expect.poll(() => row.getByText("—").elements()).toHaveLength(2);
});
