import type { PriceProduct } from "@purosur/contracts";
import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { PriceCostBreakdown } from "./price-cost-breakdown";

const rice: PriceProduct = {
  id: "product-2",
  name: "Arroz",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "KG",
  currentPrice: null,
  secondsSinceReview: null,
  pending: true,
  costReference: {
    lastCostCents: 428000,
    freightPerUnitCents: 18000,
    totalCostCents: 446000,
    marginTenthsOfPercent: null,
  },
};

const noodles: PriceProduct = { ...rice, id: "product-1", name: "Fideos", saleUnit: "UNIT" };

test("shows the last cost, the freight per kilo and the total cost of a product sold by weight", async () => {
  const screen = await render(<PriceCostBreakdown product={rice} />);

  await expect.element(screen.getByText("Último costo")).toBeVisible();
  await expect.element(screen.getByText("$ 4.280,00 / kg")).toBeVisible();
  await expect.element(screen.getByText("Flete por kilo")).toBeVisible();
  await expect.element(screen.getByText("$ 180,00 / kg")).toBeVisible();
  await expect.element(screen.getByText("Costo total")).toBeVisible();
  await expect.element(screen.getByText("$ 4.460,00 / kg")).toBeVisible();
});

test("shows the freight per unit of a product sold by unit", async () => {
  const screen = await render(<PriceCostBreakdown product={noodles} />);

  await expect.element(screen.getByText("Flete por unidad")).toBeVisible();
  await expect.element(screen.getByText("$ 180,00", { exact: true })).toBeVisible();
});

test("shows that a product has no cost instead of its cost figures", async () => {
  const screen = await render(<PriceCostBreakdown product={{ ...rice, costReference: null }} />);

  await expect.element(screen.getByText("Sin costo registrado")).toBeVisible();
  expect(screen.getByText("Último costo").query()).toBeNull();
  expect(screen.getByText("Costo total").query()).toBeNull();
});
