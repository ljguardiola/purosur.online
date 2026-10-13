import type { PriceCostReference, PriceProduct } from "@purosur/contracts";
import { FieldSizeProvider } from "@purosur/ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
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

function marginOf(reference: PriceCostReference | null): FetchPriceMarginOutcome {
  return { kind: "ok", value: { costReference: reference } };
}

function element(
  amount: string,
  fetchPriceMargin: (productId: string, unitPrice: number) => Promise<FetchPriceMarginOutcome>,
  onSessionEnded: () => void = () => {},
) {
  return (
    <FieldSizeProvider size="backoffice">
      <main>
        <PriceMarginReference
          product={rice}
          amount={amount}
          fetchPriceMargin={fetchPriceMargin}
          onSessionEnded={onSessionEnded}
        />
      </main>
    </FieldSizeProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

test("shows no margin while no price is typed, and asks for none", async () => {
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

  expect(fetchPriceMargin).toHaveBeenCalledExactlyOnceWith("product-2", 820000);
  await expect.element(screen.getByText("45,6 %")).toBeVisible();
  await expect.element(screen.getByText("$ 8.200,00 − $ 4.460,00 sobre el precio")).toBeVisible();
});

test("asks only for the price the person stopped on", async () => {
  const fetchPriceMargin = vi.fn().mockResolvedValue(marginOf(costReference));
  const screen = await render(element("8", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(100);
  await screen.rerender(element("82", fetchPriceMargin));
  await vi.advanceTimersByTimeAsync(100);
  await screen.rerender(element("8200", fetchPriceMargin));
  await vi.advanceTimersByTimeAsync(300);

  expect(fetchPriceMargin).toHaveBeenCalledExactlyOnceWith("product-2", 820000);
});

test("asks for no margin of a price that cannot be saved", async () => {
  const fetchPriceMargin = vi.fn();
  const screen = await render(element("12.50", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(2_000);

  expect(fetchPriceMargin).not.toHaveBeenCalled();
  await expect.element(screen.getByText("—")).toBeVisible();
});

test("shows a negative margin with its minus sign", async () => {
  const fetchPriceMargin = vi
    .fn()
    .mockResolvedValue(marginOf({ ...costReference, marginTenthsOfPercent: -32 }));
  const screen = await render(element("4.000,00", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(300);

  await expect.element(screen.getByText("−3,2 %")).toBeVisible();
});

test("does not show the margin of the previous price while the new one is read", async () => {
  const fetchPriceMargin = vi.fn().mockResolvedValueOnce(marginOf(costReference));
  const screen = await render(element("8.200,00", fetchPriceMargin));
  await vi.advanceTimersByTimeAsync(300);
  await expect.element(screen.getByText("45,6 %")).toBeVisible();

  fetchPriceMargin.mockReturnValue(new Promise(() => {}));
  await screen.rerender(element("9.000,00", fetchPriceMargin));
  await vi.advanceTimersByTimeAsync(300);

  expect(screen.getByText("45,6 %").query()).toBeNull();
});

test.each([
  ["a failed request", { kind: "failed" } as const],
  ["a missing cost", marginOf(null)],
])("shows a dash after %s", async (_, outcome) => {
  const fetchPriceMargin = vi.fn().mockResolvedValue(outcome);
  const screen = await render(element("8.200,00", fetchPriceMargin));

  await vi.advanceTimersByTimeAsync(300);

  await expect.element(screen.getByText("—")).toBeVisible();
});

test("ends the session when the cloud says it is over", async () => {
  const onSessionEnded = vi.fn();
  const fetchPriceMargin = vi.fn().mockResolvedValue({ kind: "unauthenticated" });
  await render(element("8.200,00", fetchPriceMargin, onSessionEnded));

  await vi.advanceTimersByTimeAsync(300);

  await vi.waitFor(() => expect(onSessionEnded).toHaveBeenCalled());
});
