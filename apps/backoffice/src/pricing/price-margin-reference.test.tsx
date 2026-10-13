import type { PriceCostReference, PriceProduct } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PriceMarginReference } from "./price-margin-reference";
import type { FetchPriceMarginOutcome } from "./prices-api";

const costReference: PriceCostReference = {
  lastCostCents: 428000,
  freightPerUnitCents: 18000,
  totalCostCents: 446000,
  marginTenthsOfPercent: 456,
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

const pricedRice: PriceProduct = {
  ...rice,
  currentPrice: {
    id: "00000000-0000-4000-8000-000000000001",
    unitPrice: 750000,
    validFrom: "2026-08-16T12:00:00.000Z",
  },
  costReference: { ...costReference, marginTenthsOfPercent: 405 },
};

function marginOf(reference: PriceCostReference | null): FetchPriceMarginOutcome {
  return { kind: "ok", value: { costReference: reference } };
}

function element(
  amount: string,
  fetchPriceMargin: (productId: string, unitPrice: number) => Promise<FetchPriceMarginOutcome>,
  onSessionEnded: () => void = () => {},
  product: PriceProduct = rice,
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PriceMarginReference
          product={product}
          amount={amount}
          fetchPriceMargin={fetchPriceMargin}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

function eventuallyShown(locator: { element: () => Element }) {
  return vi.waitFor(() => locator.element());
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

test("shows the margin of the current price while no price is typed, and asks for none", async () => {
  const fetchPriceMargin = vi.fn();
  const screen = await render(element("", fetchPriceMargin, () => {}, pricedRice));

  await vi.advanceTimersByTimeAsync(2_000);

  await expect.element(screen.getByText("40,5 %")).toBeVisible();
  await expect.element(screen.getByText("$ 7.500,00 − $ 4.460,00 sobre el precio")).toBeVisible();
  expect(fetchPriceMargin).not.toHaveBeenCalled();
});

test("shows no margin for a product without a price while no price is typed", async () => {
  const fetchPriceMargin = vi.fn();
  const screen = await render(element("", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(2_000);

  await expect.element(screen.getByText("Margen con este precio")).toBeVisible();
  await expect.element(screen.getByText("—")).toBeVisible();
  expect(fetchPriceMargin).not.toHaveBeenCalled();
});

test("asks for the margin only once the typed price has settled, then shows it with how it was reached", async () => {
  const fetchPriceMargin = vi.fn().mockResolvedValue(marginOf(costReference));
  const screen = await render(element("8.200,00", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(299);
  expect(fetchPriceMargin).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);

  await vi.waitFor(() =>
    expect(fetchPriceMargin).toHaveBeenCalledExactlyOnceWith("product-2", 820000),
  );
  await eventuallyShown(screen.getByText("45,6 %"));
  await eventuallyShown(screen.getByText("$ 8.200,00 − $ 4.460,00 sobre el precio"));
});

test("asks only for the price the person stopped on", async () => {
  const fetchPriceMargin = vi.fn().mockResolvedValue(marginOf(costReference));
  const screen = await render(element("8", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(100);
  await screen.rerender(element("82", fetchPriceMargin));
  await vi.advanceTimersByTimeAsync(100);
  await screen.rerender(element("8200", fetchPriceMargin));
  await vi.advanceTimersByTimeAsync(300);

  await vi.waitFor(() =>
    expect(fetchPriceMargin).toHaveBeenCalledExactlyOnceWith("product-2", 820000),
  );
});

test("asks for no margin of a price that cannot be saved", async () => {
  const fetchPriceMargin = vi.fn();
  const screen = await render(element("12.50", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(2_000);

  expect(fetchPriceMargin).not.toHaveBeenCalled();
  await expect.element(screen.getByText("—")).toBeVisible();
});

test("does not show the margin of the previous price while the new one is read", async () => {
  const fetchPriceMargin = vi.fn().mockResolvedValueOnce(marginOf(costReference));
  const screen = await render(element("8.200,00", fetchPriceMargin));
  await vi.advanceTimersByTimeAsync(300);
  await eventuallyShown(screen.getByText("45,6 %"));

  fetchPriceMargin.mockReturnValue(new Promise(() => {}));
  await screen.rerender(element("9.000,00", fetchPriceMargin));
  await vi.advanceTimersByTimeAsync(300);

  await vi.waitFor(() => expect(fetchPriceMargin).toHaveBeenCalledWith("product-2", 900000));
  expect(screen.getByText("45,6 %").query()).toBeNull();
});

test("shows a dash when the cloud answers no cost", async () => {
  const fetchPriceMargin = vi.fn().mockResolvedValue(marginOf(null));
  const screen = await render(element("8.200,00", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(300);

  await eventuallyShown(screen.getByText("—"));
});

test("offers to read the margin again after the read fails, and shows it once read", async () => {
  const fetchPriceMargin = vi
    .fn()
    .mockResolvedValueOnce({ kind: "failed" })
    .mockResolvedValue(marginOf(costReference));
  const screen = await render(element("8.200,00", fetchPriceMargin));
  await vi.advanceTimersByTimeAsync(300);

  await eventuallyShown(screen.getByText("No pudimos abrir el margen"));
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await eventuallyShown(screen.getByText("45,6 %"));
  expect(fetchPriceMargin).toHaveBeenCalledTimes(2);
});

test("tells the person to wait when the margin read is rate limited", async () => {
  const fetchPriceMargin = vi
    .fn()
    .mockResolvedValue({ kind: "rate_limited", retryAfterSeconds: 30 });
  const screen = await render(element("8.200,00", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(300);

  await eventuallyShown(screen.getByText("Demasiadas solicitudes"));
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("ends the session when the cloud says it is over", async () => {
  const onSessionEnded = vi.fn();
  const fetchPriceMargin = vi.fn().mockResolvedValue({ kind: "unauthenticated" });
  await render(element("8.200,00", fetchPriceMargin, onSessionEnded));

  await vi.advanceTimersByTimeAsync(300);

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
});
