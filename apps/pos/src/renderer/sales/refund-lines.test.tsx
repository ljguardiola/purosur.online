import type { OpenSale } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { RefundLines } from "./refund-lines";

type Refund = OpenSale["refunds_on_cancel"][number];

describe("RefundLines", () => {
  it("says to give back a cash refund in cash", async () => {
    const refund: Refund = { payment_id: "p1", method: "CASH", amount: 100_000, state: "APPROVED" };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(screen.getByText("Devolver $ 1.000,00 en efectivo", { exact: true }))
      .toBeVisible();
  });

  it("says a transfer refund stays pending", async () => {
    const refund: Refund = {
      payment_id: "p2",
      method: "TRANSFER",
      amount: 250_000,
      state: "PENDING",
    };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(
        screen.getByText("Reembolso pendiente de la transferencia por $ 2.500,00", {
          exact: true,
        }),
      )
      .toBeVisible();
  });

  it("says a refund given back now is given back by its payment's means", async () => {
    const refund: Refund = {
      payment_id: "p3",
      method: "TRANSFER",
      amount: 250_000,
      state: "APPROVED",
    };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(screen.getByText("Devolver $ 2.500,00 por transferencia", { exact: true }))
      .toBeVisible();
  });

  it("says a pending refund stays pending whatever its payment's means", async () => {
    const refund: Refund = { payment_id: "p4", method: "CASH", amount: 100_000, state: "PENDING" };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(
        screen.getByText("Reembolso pendiente del pago en efectivo por $ 1.000,00", {
          exact: true,
        }),
      )
      .toBeVisible();
  });

  it("lists one line per payment", async () => {
    const refunds: Refund[] = [
      { payment_id: "p1", method: "CASH", amount: 100_000, state: "APPROVED" },
      { payment_id: "p2", method: "CASH", amount: 50_000, state: "APPROVED" },
    ];

    const screen = await render(<RefundLines refunds={refunds} />);

    await expect.element(screen.getByRole("listitem").first()).toBeVisible();
    expect(screen.getByRole("listitem").elements()).toHaveLength(2);
  });
});
