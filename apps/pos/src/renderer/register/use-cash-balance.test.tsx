import type { CashBalance } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useCashBalance } from "./use-cash-balance";

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

function Probe({ load }: { load: () => Promise<CashBalance | null | "unavailable"> }) {
  const { state, retry, refresh } = useCashBalance(load);
  return (
    <>
      <p>{state.status === "loaded" ? `expected ${state.balance.expected}` : state.status}</p>
      <button type="button" onClick={retry}>
        retry
      </button>
      <button type="button" onClick={refresh}>
        refresh
      </button>
    </>
  );
}

describe("useCashBalance", () => {
  it("loads while the balance is read and then holds it", async () => {
    const screen = await render(<Probe load={async () => BALANCE} />);

    await expect.element(screen.getByText("expected 2000000")).toBeVisible();
  });

  it("fails when the core cannot tell the balance", async () => {
    const screen = await render(<Probe load={async () => "unavailable"} />);

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("fails when reading the balance throws", async () => {
    const screen = await render(
      <Probe load={() => Promise.reject(new Error("the core connection was replaced"))} />,
    );

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("keeps loading when there is no open session, until the register leaves the screen", async () => {
    const screen = await render(<Probe load={async () => null} />);

    await expect.element(screen.getByText("loading")).toBeVisible();
  });

  it("reads again from the loading state when retried", async () => {
    const load = vi
      .fn<() => Promise<CashBalance | "unavailable">>()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValueOnce(BALANCE);
    const screen = await render(<Probe load={load} />);
    await expect.element(screen.getByText("failed")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "retry" }));

    await expect.element(screen.getByText("expected 2000000")).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reads again without leaving the balance it already shows when refreshed", async () => {
    const load = vi
      .fn<() => Promise<CashBalance>>()
      .mockResolvedValueOnce(BALANCE)
      .mockImplementationOnce(() => new Promise(() => {}));
    const screen = await render(<Probe load={load} />);
    await expect.element(screen.getByText("expected 2000000")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await expect.element(screen.getByText("expected 2000000")).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shows the new balance once a refresh answers", async () => {
    const load = vi
      .fn<() => Promise<CashBalance>>()
      .mockResolvedValueOnce(BALANCE)
      .mockResolvedValueOnce({ ...BALANCE, expected: 2_500_000 });
    const screen = await render(<Probe load={load} />);
    await expect.element(screen.getByText("expected 2000000")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));

    await expect.element(screen.getByText("expected 2500000")).toBeVisible();
  });
});
