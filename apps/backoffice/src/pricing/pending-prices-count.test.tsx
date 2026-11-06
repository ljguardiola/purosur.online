import type { PriceList } from "@purosur/contracts";
import { expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { usePendingPricesCount } from "./pending-prices-count";

const priceList = (pendingCount: number): PriceList => ({
  products: [],
  categories: [],
  pendingCount,
  activeProductCount: 10,
  reviewWindowDays: 30,
});

function Probe({
  enabled,
  fetchPrices,
}: {
  enabled: boolean;
  fetchPrices: Parameters<typeof usePendingPricesCount>[0]["fetchPrices"];
}) {
  const count = usePendingPricesCount({ enabled, fetchPrices, onSessionEnded: () => {} });
  return <p>{count.status === "loaded" ? `${count.value} prices` : count.status}</p>;
}

test("counts the prices the cloud says are pending review, asking only for the pending ones", async () => {
  const fetchPrices = vi.fn().mockResolvedValue({ kind: "ok", value: priceList(7) });

  const screen = await render(<Probe enabled fetchPrices={fetchPrices} />);

  await expect.element(screen.getByText("7 prices")).toBeInTheDocument();
  expect(fetchPrices).toHaveBeenCalledExactlyOnceWith({ review: "pending" });
});

test("asks the cloud for nothing while not enabled", async () => {
  const fetchPrices = vi.fn().mockResolvedValue({ kind: "ok", value: priceList(7) });

  const screen = await render(<Probe enabled={false} fetchPrices={fetchPrices} />);

  await expect.element(screen.getByText("loading")).toBeInTheDocument();
  expect(fetchPrices).not.toHaveBeenCalled();
});
