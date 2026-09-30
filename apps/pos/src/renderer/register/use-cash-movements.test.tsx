import type { ListedCashMovement } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useCashMovements } from "./use-cash-movements";

const OPENING: ListedCashMovement = {
  id: "m1",
  type: "OPENING",
  amount: 2_000_000,
  reason: null,
  occurred_at: "2026-09-30T12:02:00.000Z",
  actor: { user_id: "u1", first_name: "Ada" },
  authorized_by: null,
};
const CASH_IN: ListedCashMovement = { ...OPENING, id: "m2", type: "CASH_IN" };

function Probe({ load }: { load: () => Promise<ListedCashMovement[] | null | "unavailable"> }) {
  const { state, retry, refresh } = useCashMovements(load);
  return (
    <>
      <p>
        {"movements" in state
          ? `${state.status} ${state.movements.length} movements`
          : state.status}
      </p>
      <button type="button" onClick={retry}>
        retry
      </button>
      <button type="button" onClick={refresh}>
        refresh
      </button>
    </>
  );
}

describe("useCashMovements", () => {
  it("loads while the movements are read and then holds them", async () => {
    const screen = await render(<Probe load={async () => [OPENING]} />);

    await expect.element(screen.getByText("loaded 1 movements")).toBeVisible();
  });

  it("fails when the core cannot list the movements", async () => {
    const screen = await render(<Probe load={async () => "unavailable"} />);

    await expect.element(screen.getByText("failed")).toBeVisible();
  });

  it("reads again from the loading state when retried", async () => {
    const load = vi
      .fn<() => Promise<ListedCashMovement[] | "unavailable">>()
      .mockResolvedValueOnce("unavailable")
      .mockResolvedValueOnce([OPENING]);
    const screen = await render(<Probe load={load} />);
    await expect.element(screen.getByText("failed")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "retry" }));

    await expect.element(screen.getByText("loaded 1 movements")).toBeVisible();
  });

  it("reports the movements it shows as refreshing while a refresh reads again, then shows the new ones", async () => {
    let answer: (movements: ListedCashMovement[]) => void = () => {};
    const load = vi
      .fn<() => Promise<ListedCashMovement[]>>()
      .mockResolvedValueOnce([OPENING])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );
    const screen = await render(<Probe load={load} />);
    await expect.element(screen.getByText("loaded 1 movements")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));
    await expect.element(screen.getByText("refreshing 1 movements")).toBeVisible();
    answer([OPENING, CASH_IN]);

    await expect.element(screen.getByText("loaded 2 movements")).toBeVisible();
  });
});
