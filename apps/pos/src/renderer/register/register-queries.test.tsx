import type { CashBalance, ListedCashMovement } from "@purosur/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { createQueryClient } from "../platform/query-client";
import type { CoreData } from "../platform/use-core-query";
import { useCashBalanceQuery, useCashMovementsQuery, useRefreshCash } from "./register-queries";

const BALANCE: CashBalance = {
  opening_float: 2_000_000,
  cash_sales: 0,
  change_given: 0,
  refunds: 0,
  cash_in: 0,
  expenses: 0,
  withdrawals: 0,
  expected: 2_000_000,
};

const OPENING: ListedCashMovement = {
  id: "m1",
  type: "OPENING",
  amount: 2_000_000,
  reason: null,
  occurred_at: "2026-09-30T12:02:00.000Z",
  actor: { user_id: "u1", first_name: "Ada" },
  authorized_by: null,
};

function describeData<T>(data: CoreData<T>, describeValue: (value: T) => string): string {
  return data.status === "loaded" ? describeValue(data.value) : data.status;
}

type Reads = {
  balance: () => Promise<CashBalance | null | "unavailable">;
  movements: () => Promise<ListedCashMovement[] | null | "unavailable">;
};

function Probe({ balance, movements }: Reads) {
  const balanceData = useCashBalanceQuery(balance);
  const movementsData = useCashMovementsQuery(movements);
  const refreshCash = useRefreshCash();
  return (
    <>
      <p>{["balance", describeData(balanceData, (value) => String(value.expected))].join(" ")}</p>
      <p>{["movements", describeData(movementsData, (value) => String(value.length))].join(" ")}</p>
      <button type="button" onClick={refreshCash}>
        refresh
      </button>
    </>
  );
}

function renderProbe(reads: Reads) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <Probe {...reads} />
    </QueryClientProvider>,
  );
}

describe("cash queries", () => {
  it("hold the balance and the movements the core answers", async () => {
    const screen = await renderProbe({
      balance: async () => BALANCE,
      movements: async () => [OPENING],
    });

    await expect.element(screen.getByText("balance 2000000")).toBeVisible();
    await expect.element(screen.getByText("movements 1")).toBeVisible();
  });

  it("fail when the core cannot answer", async () => {
    const screen = await renderProbe({
      balance: async () => "unavailable",
      movements: () => Promise.reject(new Error("the connection was replaced")),
    });

    await expect.element(screen.getByText("balance failed")).toBeVisible();
    await expect.element(screen.getByText("movements failed")).toBeVisible();
  });

  it("neither fail nor show data while there is no open session", async () => {
    const balance = vi.fn(async () => null);
    const screen = await renderProbe({ balance, movements: async () => null });

    await expect.poll(() => balance.mock.calls.length).toBe(1);
    await expect.element(screen.getByText("balance loading")).toBeVisible();
    await expect.element(screen.getByText("movements loading")).toBeVisible();
  });

  it("read both again when the cash is refreshed", async () => {
    const balance = vi
      .fn<Reads["balance"]>()
      .mockResolvedValueOnce(BALANCE)
      .mockResolvedValueOnce({ ...BALANCE, expected: 2_500_000 });
    const movements = vi
      .fn<Reads["movements"]>()
      .mockResolvedValueOnce([OPENING])
      .mockResolvedValueOnce([OPENING, { ...OPENING, id: "m2" }]);
    const screen = await renderProbe({ balance, movements });
    await expect.element(screen.getByText("balance 2000000")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await expect.element(screen.getByText("balance 2500000")).toBeVisible();
    await expect.element(screen.getByText("movements 2")).toBeVisible();
  });
});
