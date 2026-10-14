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

  it("says a QR payment's refund stays pending", async () => {
    const refund: Refund = { payment_id: "p4", method: "QR", amount: 90_000, state: "PENDING" };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(
        screen.getByText("Reembolso pendiente del pago con QR por $ 900,00", { exact: true }),
      )
      .toBeVisible();
  });

  it("says a standalone terminal payment's refund stays pending", async () => {
    const refund: Refund = {
      payment_id: "p7",
      method: "STANDALONE_TERMINAL",
      amount: 90_000,
      state: "PENDING",
    };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(
        screen.getByText(
          "Reembolso pendiente del pago con la terminal independiente por $ 900,00",
          {
            exact: true,
          },
        ),
      )
      .toBeVisible();
  });

  it("explains under a pending standalone terminal refund that a person gives it back outside the register, never in cash", async () => {
    const refund: Refund = {
      payment_id: "p7",
      method: "STANDALONE_TERMINAL",
      amount: 90_000,
      state: "PENDING",
    };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(
        screen.getByText(
          "Lo devuelve una persona desde la terminal independiente o la app de Mercado Pago, nunca en efectivo.",
          { exact: true },
        ),
      )
      .toBeVisible();
  });

  it("explains under a pending QR refund that the cloud sends it to Mercado Pago once a person confirms it", async () => {
    const refund: Refund = { payment_id: "p9", method: "QR", amount: 70_000, state: "PENDING" };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(
        screen.getByText(
          "La nube lo envía a Mercado Pago cuando alguien lo confirma en el backoffice.",
          { exact: true },
        ),
      )
      .toBeVisible();
  });

  it("explains nothing under a pending transfer refund", async () => {
    const refund: Refund = {
      payment_id: "p2",
      method: "TRANSFER",
      amount: 250_000,
      state: "PENDING",
    };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect.element(screen.getByText(/Lo devuelve una persona/)).not.toBeInTheDocument();
  });

  it("says a standalone terminal payment's refund given back now goes back by that terminal", async () => {
    const refund: Refund = {
      payment_id: "p8",
      method: "STANDALONE_TERMINAL",
      amount: 90_000,
      state: "APPROVED",
    };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(screen.getByText("Devolver $ 900,00 por la terminal independiente", { exact: true }))
      .toBeVisible();
  });

  it("says a terminal payment's refund stays pending", async () => {
    const refund: Refund = { payment_id: "p5", method: "POINT", amount: 90_000, state: "PENDING" };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(
        screen.getByText("Reembolso pendiente del pago con la terminal por $ 900,00", {
          exact: true,
        }),
      )
      .toBeVisible();
  });

  it("says a terminal payment's refund given back now goes back by the terminal", async () => {
    const refund: Refund = { payment_id: "p6", method: "POINT", amount: 90_000, state: "APPROVED" };

    const screen = await render(<RefundLines refunds={[refund]} />);

    await expect
      .element(
        screen.getByText("Devolver $ 900,00 por la terminal de Mercado Pago", { exact: true }),
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
