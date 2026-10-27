import type { PriceCostReference, PriceProduct } from "@purosur/contracts";
import { expect, test } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { PriceCostBreakdown } from "./price-cost-breakdown";

const costReference: PriceCostReference = {
  lastCostCents: 428000,
  freightPerUnitCents: 18000,
  totalCostCents: 446000,
  marginTenthsOfPercent: null,
  costIncomplete: false,
};

const rice: PriceProduct = {
  id: "product-2",
  name: "Arroz",
  categoryId: "category-1",
  categoryName: "Almacén",
  saleUnit: "KG",
  currentPrice: null,
  secondsSinceReview: null,
  pending: true,
  costReference,
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

test("warns that the cost is incomplete when part of it is unknown", async () => {
  const screen = await render(
    <PriceCostBreakdown
      product={{ ...rice, costReference: { ...costReference, costIncomplete: true } }}
    />,
  );

  await expect.element(screen.getByText("Costo incompleto")).toBeVisible();
  await expect.element(screen.getByText("$ 4.460,00 / kg")).toBeVisible();
});

test("does not warn about an incomplete cost when the cost is complete", async () => {
  const screen = await render(<PriceCostBreakdown product={rice} />);

  expect(screen.getByText("Costo incompleto").query()).toBeNull();
});

test("explains that a purchase, a batch or an initial inventory cost makes the margin appear", async () => {
  const screen = await render(<PriceCostBreakdown product={{ ...rice, costReference: null }} />);

  await expect
    .element(
      screen.getByText(
        "El margen aparece cuando el producto tenga una compra, una tanda o un costo de inventario inicial.",
      ),
    )
    .toBeVisible();
});
