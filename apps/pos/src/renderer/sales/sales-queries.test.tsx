import type {
  CashChargeAnswer,
  CurrentSaleAnswer,
  OpenSale,
  SearchProductsOutcome,
} from "@purosur/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../platform/query-client";
import {
  useCashChargeQuery,
  useCurrentSaleQuery,
  useResetCurrentSale,
  useSearchProducts,
  useTakeSale,
} from "./sales-queries";

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

function CurrentSaleProbe({
  read,
  sessionId = "s1",
  userId = "u1",
}: {
  read: () => Promise<CurrentSaleAnswer>;
  sessionId?: string;
  userId?: string;
}) {
  const current = useCurrentSaleQuery({ sessionId, userId, read });
  const takeSale = useTakeSale(sessionId, userId);
  const resetCurrentSale = useResetCurrentSale(sessionId, userId);
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
      <button type="button" onClick={() => takeSale(null)}>
        take none
      </button>
      <button type="button" onClick={() => void resetCurrentSale()}>
        reset
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

  it.each([
    ["another person", "s1", "u2"],
    ["another session", "s2", "u1"],
  ])("never shows the answer given to %s", async (_who, sessionId, userId) => {
    const queryClient = createQueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <CurrentSaleProbe read={async () => "not_permitted"} />
      </QueryClientProvider>,
    );
    await expect.element(screen.getByText("not_permitted")).toBeVisible();

    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <CurrentSaleProbe
          read={() => new Promise(() => {})}
          sessionId={sessionId}
          userId={userId}
        />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("loading")).toBeVisible();
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
    expect(read).toHaveBeenCalledOnce();
  });

  it("shows no sale when the register took none from an outcome", async () => {
    const read = vi.fn<() => Promise<CurrentSaleAnswer>>(async () => SALE);
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("sale-1")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "take none" }));

    await expect.element(screen.getByText("null")).toBeVisible();
    expect(read).toHaveBeenCalledOnce();
  });

  it("goes back to loading until the sale is read again when it is reset", async () => {
    let answer: (sale: CurrentSaleAnswer) => void = () => {};
    const read = vi
      .fn<() => Promise<CurrentSaleAnswer>>()
      .mockResolvedValueOnce(SALE)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
    const screen = await renderWithClient(<CurrentSaleProbe read={read} />);
    await expect.element(screen.getByText("sale-1")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "reset" }));
    await expect.element(screen.getByText("loading")).toBeVisible();
    answer(null);

    await expect.element(screen.getByText("null")).toBeVisible();
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

function CashChargeProbe({
  read,
  saleId = "sale-1",
  total = 476_000,
  tendered,
}: {
  read: (tendered: number) => Promise<CashChargeAnswer>;
  saleId?: string;
  total?: number;
  tendered: number | undefined;
}) {
  const charge = useCashChargeQuery({ saleId, total, tendered, read });
  return <p>{charge.status === "loaded" ? JSON.stringify(charge.value) : charge.status}</p>;
}

describe("cash charge query", () => {
  it.each<[string, CashChargeAnswer]>([
    ["what the sale needs", { kind: "covered", applied: 476_000, change: 24_000 }],
    ["no sale in progress", null],
    ["a refusal to sell", "not_permitted"],
  ])("holds %s as an answer, not a failure", async (_name, answer) => {
    const screen = await renderWithClient(
      <CashChargeProbe read={async () => answer} tendered={500_000} />,
    );

    await expect.element(screen.getByText(JSON.stringify(answer))).toBeVisible();
  });

  it("asks the core with the tendered amount", async () => {
    const read = vi.fn<(tendered: number) => Promise<CashChargeAnswer>>(async () => null);
    const screen = await renderWithClient(<CashChargeProbe read={read} tendered={500_005} />);

    await expect.element(screen.getByText("null")).toBeVisible();
    expect(read).toHaveBeenCalledExactlyOnceWith(500_005);
  });

  it("does not ask while there is no amount tendered", async () => {
    const read = vi.fn<(tendered: number) => Promise<CashChargeAnswer>>(async () => null);
    const screen = await renderWithClient(<CashChargeProbe read={read} tendered={undefined} />);

    await expect.element(screen.getByText("loading")).toBeVisible();
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ["another amount", "sale-1", 476_000, 400_000],
    ["another sale", "sale-2", 476_000, 500_000],
    ["another total of the sale", "sale-1", 490_000, 500_000],
  ])("never shows the answer given for %s", async (_what, saleId, total, tendered) => {
    const queryClient = createQueryClient();
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <CashChargeProbe read={async () => "not_permitted"} tendered={500_000} />
      </QueryClientProvider>,
    );
    await expect.element(screen.getByText('"not_permitted"')).toBeVisible();

    await screen.rerender(
      <QueryClientProvider client={queryClient}>
        <CashChargeProbe
          read={() => new Promise(() => {})}
          saleId={saleId}
          total={total}
          tendered={tendered}
        />
      </QueryClientProvider>,
    );

    await expect.element(screen.getByText("loading")).toBeVisible();
  });

  it("fails when the core cannot answer", async () => {
    const screen = await renderWithClient(
      <CashChargeProbe
        read={() => Promise.reject(new Error("the connection was replaced"))}
        tendered={500_000}
      />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });
});
