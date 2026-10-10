import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { pricesListFilters } from "./routes";
import {
  createServices,
  renderScreen,
  rice,
  withoutPrice,
} from "./test-support/prices-list-screen";

function listOf(products: (typeof rice)[], pendingCount = products.length) {
  return {
    kind: "ok" as const,
    value: {
      products,
      pendingCount,
      activeProductCount: 3,
      reviewWindowDays: 30,
      categories: [],
    },
  };
}

const purchaseFilters = pricesListFilters.parse({ reviewProducts: [withoutPrice.id, rice.id] });

test("opened with products to review, it walks the pending ones among them, starting with a purchase notice", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async (input) =>
    input.productIds ? listOf([withoutPrice, rice]) : listOf([withoutPrice, rice, rice], 3),
  );

  const screen = await renderScreen(services, () => {}, { filters: purchaseFilters });

  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();
  expect(services.fetchPrices).toHaveBeenCalledWith({
    review: "pending",
    productIds: [withoutPrice.id, rice.id],
  });
  await expect.element(screen.getByText("Compra registrada")).toBeVisible();
});

test("after the walk reads its products, it reports its filters without them, so a reload does not walk again", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listOf([withoutPrice, rice]));
  const onFiltersChange = vi.fn();

  const screen = await renderScreen(services, () => {}, {
    filters: purchaseFilters,
    onFiltersChange,
  });
  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();

  expect(onFiltersChange).toHaveBeenLastCalledWith(pricesListFilters.parse({}));
});

test("walks the products it was opened with only once, even when the filters are reported back without them", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listOf([withoutPrice, rice]));
  const screen = await renderScreen(services, () => {}, {
    filters: purchaseFilters,
    onFiltersChange: () => {},
  });
  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();

  const limitedReads = vi
    .mocked(services.fetchPrices)
    .mock.calls.filter(([input]) => input.productIds !== undefined);
  expect(limitedReads).toHaveLength(1);
});

test("when none of the products is pending any more, it opens the list without a walk", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async (input) =>
    input.productIds ? listOf([], 0) : listOf([rice], 1),
  );

  const screen = await renderScreen(services, () => {}, { filters: purchaseFilters });

  await expect.element(screen.getByText("Arroz")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("opened without products to review, it starts no walk", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listOf([rice]));

  const screen = await renderScreen(services);
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(
    vi.mocked(services.fetchPrices).mock.calls.every(([input]) => input.productIds === undefined),
  ).toBe(true);
});

test("the walk it opens saves a price like the one started from the button", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listOf([withoutPrice]));
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "ok" });

  const screen = await renderScreen(services, () => {}, { filters: purchaseFilters });
  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();
  await userEvent.fill(screen.getByLabelText("Precio de venta por unidad"), "1");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Precio actualizado")).toBeVisible();
});
