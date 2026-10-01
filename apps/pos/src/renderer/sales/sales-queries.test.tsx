import type { CurrentSaleAnswer, OpenSale, SearchProductsOutcome } from "@purosur/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../platform/query-client";
import { useCurrentSaleQuery, useSearchProducts, useTakeSale } from "./sales-queries";

const SALE: OpenSale = {
  id: "sale-1",
  lines: [
    {
      id: "line-1",
      product_id: "p1",
      product_name: "Yerba mate 1 kg",
      quantity: 1,
      list_unit_price: 238_000,
      discount_amount: 0,
      promotion: null,
      line_total: 238_000,
    },
  ],
  total: 238_000,
};

function CurrentSaleProbe({ read }: { read: () => Promise<CurrentSaleAnswer> }) {
  const current = useCurrentSaleQuery(read);
  const takeSale = useTakeSale();
  let text: string = current.status;
  if (current.status === "loaded") {
    text =
      current.value === null || current.value === "not_permitted"
        ? String(current.value)
        : current.value.id;
  }
  return (
    <>
      <p>{text}</p>
      <button type="button" onClick={() => takeSale(SALE)}>
        take
      </button>
    </>
  );
}

function renderWithClient(ui: React.ReactNode) {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}

describe("current sale query", () => {
  it.each<[string, CurrentSaleAnswer]>([
    ["the sale in progress", SALE],
    ["no sale yet", null],
    ["a refusal to sell", "not_permitted"],
  ])("holds %s as an answer, not a failure", async (_name, answer) => {
    const screen = await renderWithClient(<CurrentSaleProbe read={async () => answer} />);

    await expect
      .element(
        screen.getByText(
          answer === null || answer === "not_permitted" ? String(answer) : answer.id,
        ),
      )
      .toBeVisible();
  });

  it("fails when the core cannot answer", async () => {
    const screen = await renderWithClient(
      <CurrentSaleProbe read={() => Promise.reject(new Error("the connection was replaced"))} />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("shows a sale the register took from an outcome without reading again", async () => {
    const read = vi.fn<() => Promise<CurrentSaleAnswer>>(async () => null);
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("null")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "take" }));

    await expect.element(screen.getByText("sale-1")).toBeVisible();
  });
});

function SearchProbe({ read }: { read: (query: string) => Promise<SearchProductsOutcome> }) {
  const search = useSearchProducts(read);
  return (
    <button
      type="button"
      onClick={() => void search("yerba").then((outcome) => (document.title = outcome.kind))}
    >
      search
    </button>
  );
}

describe("product search", () => {
  it("answers what the core found", async () => {
    const read = vi.fn(async () => ({ kind: "results" as const, products: [], more: false }));
    const screen = await renderWithClient(<SearchProbe read={read} />);

    await userEvent.click(screen.getByRole("button", { name: "search" }));

    await expect.poll(() => document.title).toBe("results");
    expect(read).toHaveBeenCalledWith("yerba");
  });

  it("answers unavailable when the read is rejected", async () => {
    const screen = await renderWithClient(
      <SearchProbe read={() => Promise.reject(new Error("the connection was replaced"))} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "search" }));

    await expect.poll(() => document.title).toBe("unavailable");
  });
});
