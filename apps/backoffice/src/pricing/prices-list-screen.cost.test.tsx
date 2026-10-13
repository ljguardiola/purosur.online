import type { PriceProduct } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  createServices,
  openRicePriceModal,
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

test("the change-price modal asks the cloud for the margin of the typed price", async () => {
  const services = createServices();
  const screen = await openRicePriceModal(services);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    vi.mocked(services.fetchPriceMargin).mockResolvedValue({
      kind: "ok",
      value: {
        costReference: {
          lastCostCents: 428000,
          freightPerUnitCents: 18000,
          totalCostCents: 446000,
          marginTenthsOfPercent: 456,
        },
      },
    });

    await userEvent.fill(screen.getByLabelText("Precio de venta por kilo"), "8200");
    await vi.advanceTimersByTimeAsync(2_000);

    await vi.waitFor(() =>
      expect(services.fetchPriceMargin).toHaveBeenCalledWith("product-2", 820000),
    );
    await vi.waitFor(() => screen.getByRole("dialog").getByText("45,6 %").element());
  } finally {
    vi.useRealTimers();
  }
});
