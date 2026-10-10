import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
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

const purchasedProductsToReview = [withoutPrice.id, rice.id];

function limitedReads(services: ReturnType<typeof createServices>) {
  return vi
    .mocked(services.fetchPrices)
    .mock.calls.filter(([input]) => input.productIds !== undefined);
}

test("opened with a purchase's products to review, it walks the pending ones among them, starting with a purchase notice", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async (input) =>
    input.productIds ? listOf([withoutPrice, rice]) : listOf([withoutPrice, rice, rice], 3),
  );

  const screen = await renderScreen(services, () => {}, { purchasedProductsToReview });

  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();
  expect(services.fetchPrices).toHaveBeenCalledWith({
    review: "pending",
    productIds: purchasedProductsToReview,
  });
  await expect.element(screen.getByText("Compra registrada")).toBeVisible();
});

test("takes the purchase's products to review as it opens, so a reload does not walk them again", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listOf([withoutPrice, rice]));
  const onPurchaseReviewTaken = vi.fn();

  const screen = await renderScreen(services, () => {}, {
    purchasedProductsToReview,
    onPurchaseReviewTaken,
  });
  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();

  expect(onPurchaseReviewTaken).toHaveBeenCalledOnce();
});

test("walks a purchase's products only once", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listOf([withoutPrice, rice]));

  const screen = await renderScreen(services, () => {}, { purchasedProductsToReview });
  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();

  expect(limitedReads(services)).toHaveLength(1);
});

test("when none of the purchase's products is pending any more, it opens the list without a walk", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockImplementation(async (input) =>
    input.productIds ? listOf([], 0) : listOf([rice], 1),
  );

  const screen = await renderScreen(services, () => {}, { purchasedProductsToReview });

  await expect.element(screen.getByText("Arroz")).toBeVisible();
  expect(screen.getByRole("dialog").query()).toBeNull();
});

test("opened without a purchase's products to review, it starts no walk", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listOf([rice]));
  const onPurchaseReviewTaken = vi.fn();

  const screen = await renderScreen(services, () => {}, { onPurchaseReviewTaken });
  await expect.element(screen.getByText("Arroz")).toBeVisible();

  expect(screen.getByRole("dialog").query()).toBeNull();
  expect(limitedReads(services)).toHaveLength(0);
  expect(onPurchaseReviewTaken).not.toHaveBeenCalled();
});

test("the walk it opens saves a price like the one started from the button", async () => {
  const services = createServices();
  vi.mocked(services.fetchPrices).mockResolvedValue(listOf([withoutPrice]));
  vi.mocked(services.setPrice).mockResolvedValue({ kind: "ok" });

  const screen = await renderScreen(services, () => {}, { purchasedProductsToReview });
  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();
  await userEvent.fill(screen.getByLabelText("Precio de venta por unidad"), "1");
  await userEvent.click(screen.getByRole("button", { name: "Guardar el precio nuevo" }));

  await expect.poll(() => screen.getByRole("dialog").query()).toBeNull();
  await expect.element(screen.getByText("Precio actualizado")).toBeVisible();
});

test("when the purchase's products cannot be read, it says so and retries those products from its review button", async () => {
  const services = createServices();
  let limitedReadFails = true;
  vi.mocked(services.fetchPrices).mockImplementation(async (input) => {
    if (!input.productIds) {
      return listOf([withoutPrice, rice, rice], 3);
    }
    if (limitedReadFails) {
      limitedReadFails = false;
      return { kind: "failed" };
    }
    return listOf([withoutPrice, rice]);
  });

  const screen = await renderScreen(services, () => {}, { purchasedProductsToReview });
  await expect
    .element(screen.getByText("No se pudo empezar la revisión de lo comprado"))
    .toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Revisar lo comprado" }));

  await expect.element(screen.getByRole("heading", { name: "Fideos" })).toBeVisible();
  expect(limitedReads(services)).toEqual([
    [{ review: "pending", productIds: purchasedProductsToReview }],
    [{ review: "pending", productIds: purchasedProductsToReview }],
  ]);
});
