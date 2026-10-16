import type { CancelPaidSaleOutcome, CurrentSaleAnswer, OpenSale } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { renderScreen, SALE_OF_YERBA } from "./test-support/sale-screen";

const CASH_REFUND = {
  payment_id: "p1",
  method: "CASH",
  amount: 100_000,
  state: "APPROVED",
  sent_by_cloud: false,
} as const;
const PAID_SALE: OpenSale = {
  ...SALE_OF_YERBA,
  paid: 100_000,
  pending: 376_000,
  lines_lock: "approved_payment",
  cancel_refusal: null,
  refunds_on_cancel: [CASH_REFUND],
};
const STANDALONE_TERMINAL_REFUND = {
  payment_id: "p2",
  method: "STANDALONE_TERMINAL",
  amount: 90_000,
  state: "PENDING",
  sent_by_cloud: false,
} as const;
const SALE_WITH_STANDALONE_TERMINAL_PAYMENT: OpenSale = {
  ...PAID_SALE,
  paid: 90_000,
  refunds_on_cancel: [STANDALONE_TERMINAL_REFUND],
};
const QR_REFUND = {
  payment_id: "p3",
  method: "QR",
  amount: 70_000,
  state: "PENDING",
  sent_by_cloud: true,
} as const;
const SALE_WITH_QR_PAYMENT: OpenSale = {
  ...PAID_SALE,
  paid: 70_000,
  refunds_on_cancel: [QR_REFUND],
};
const POINT_REFUND = {
  payment_id: "p4",
  method: "POINT",
  amount: 60_000,
  state: "PENDING",
  sent_by_cloud: true,
} as const;
const SALE_WITH_POINT_PAYMENT: OpenSale = {
  ...PAID_SALE,
  paid: 60_000,
  refunds_on_cancel: [POINT_REFUND],
};
const CANCELLED: CancelPaidSaleOutcome = {
  kind: "cancelled",
  refunds: [CASH_REFUND],
  authorized_by: null,
};

function readingFirst(
  before: OpenSale,
  after: CurrentSaleAnswer,
): () => Promise<CurrentSaleAnswer> {
  const reads = [before];
  return async () => reads.shift() ?? after;
}

describe("SaleScreen cancelling a sale with approved payments", () => {
  it("offers to cancel it and says what the cancellation refunds before doing it", async () => {
    const { screen } = await renderScreen({ currentSale: async () => PAID_SALE });

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await expect.element(screen.getByRole("dialog", { name: "¿Cancelar la venta?" })).toBeVisible();
    await expect
      .element(screen.getByText("Devolver $ 1.000,00 en efectivo", { exact: true }))
      .toBeVisible();
  });

  it("asks the core to cancel the sale shown and empties the cart", async () => {
    const cancelPaidSale = vi.fn(async (): Promise<CancelPaidSaleOutcome> => CANCELLED);
    const { screen } = await renderScreen({
      currentSale: readingFirst(PAID_SALE, null),
      cancelPaidSale,
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    expect(cancelPaidSale).toHaveBeenCalledExactlyOnceWith("sale-1", undefined);
    await expect.element(screen.getByText("Yerba mate 1 kg")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("dialog", { name: "Venta cancelada" })).toBeVisible();
    await expect
      .element(screen.getByText("Devolver $ 1.000,00 en efectivo", { exact: true }))
      .toBeVisible();
  });

  it("goes back to the empty sale, ready to scan, once the cashier is done", async () => {
    const { screen, field } = await renderScreen({
      currentSale: readingFirst(PAID_SALE, null),
      cancelPaidSale: async () => CANCELLED,
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    await screen.getByRole("button", { name: "Cancelar venta" }).click();
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await screen.getByRole("button", { name: "Listo" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(field).toHaveFocus();
  });

  it("asks for someone's PIN when the core says cancelling needs another person's authorization", async () => {
    const cancelPaidSale = vi.fn(async (): Promise<CancelPaidSaleOutcome> => CANCELLED);
    const loadAuthorizers = vi.fn(async () => [{ id: "u2", first_name: "Grace" }]);
    const { screen } = await renderScreen({
      currentSale: async () => ({ ...PAID_SALE, cancel_authorization_required: true }),
      cancelPaidSale,
      loadAuthorizers,
    });
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await expect.element(screen.getByText("AUTORIZA ALGUIEN CON PERMISO")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /Persona que autoriza/ }));
    await userEvent.click(screen.getByRole("option", { name: "Grace" }));
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    expect(loadAuthorizers).toHaveBeenCalledWith("void_sale");
    expect(cancelPaidSale).toHaveBeenCalledExactlyOnceWith("sale-1", {
      user_id: "u2",
      pin: "1234",
    });
  });

  it("reads the sale again when the core says it is no longer in progress", async () => {
    const { screen } = await renderScreen({
      currentSale: readingFirst(PAID_SALE, null),
      cancelPaidSale: async () => ({ kind: "no_open_sale" }),
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await expect.element(screen.getByText("Yerba mate 1 kg")).not.toBeInTheDocument();
  });

  it("asks to sign in again when the core says the session is no longer valid", async () => {
    const onSessionInvalid = vi.fn();
    const { screen } = await renderScreen({
      currentSale: async () => PAID_SALE,
      cancelPaidSale: async () => ({ kind: "no_open_session" }),
      onSessionInvalid,
    });
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    await vi.waitFor(() => expect(onSessionInvalid).toHaveBeenCalledOnce());
  });

  it("keeps the sale when the cashier keeps selling", async () => {
    const cancelPaidSale = vi.fn(async (): Promise<CancelPaidSaleOutcome> => CANCELLED);
    const { screen } = await renderScreen({ currentSale: async () => PAID_SALE, cancelPaidSale });
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await screen.getByRole("button", { name: "Seguir con la venta" }).click();

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });

  it("keeps cancelling a sale without payments without asking the core for a refund", async () => {
    const cancelPaidSale = vi.fn(async (): Promise<CancelPaidSaleOutcome> => CANCELLED);
    const { screen } = await renderScreen({
      currentSale: async () => SALE_OF_YERBA,
      cancelPaidSale,
    });

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await expect.element(screen.getByText(/no se cobra nada/)).toBeVisible();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });
});

describe("SaleScreen cancelling a sale with an approved standalone terminal payment", () => {
  it("offers to cancel a sale paid on the standalone terminal, showing its pending refund", async () => {
    const cancelPaidSale = vi.fn(async (): Promise<CancelPaidSaleOutcome> => CANCELLED);
    const { screen } = await renderScreen({
      currentSale: async () => SALE_WITH_STANDALONE_TERMINAL_PAYMENT,
      cancelPaidSale,
    });

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    const dialog = screen.getByRole("dialog", { name: "¿Cancelar la venta?" });
    await expect
      .element(
        dialog.getByText("Reembolso pendiente del pago con la terminal independiente por $ 900,00"),
      )
      .toBeVisible();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });
});

describe("SaleScreen cancelling a sale with an approved Mercado Pago QR payment", () => {
  it("offers to cancel it, showing its pending refund and who sends it", async () => {
    const cancelPaidSale = vi.fn(async (): Promise<CancelPaidSaleOutcome> => CANCELLED);
    const { screen } = await renderScreen({
      currentSale: async () => SALE_WITH_QR_PAYMENT,
      cancelPaidSale,
    });

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    const dialog = screen.getByRole("dialog", { name: "¿Cancelar la venta?" });
    await expect
      .element(dialog.getByText("Reembolso pendiente del pago con QR por $ 700,00"))
      .toBeVisible();
    await expect
      .element(
        dialog.getByText(
          "La nube lo envía a Mercado Pago cuando alguien lo confirma en el backoffice.",
        ),
      )
      .toBeVisible();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });
});

describe("SaleScreen cancelling a sale with an approved integrated terminal payment", () => {
  it("offers to cancel it, showing its pending refund and who sends it", async () => {
    const cancelPaidSale = vi.fn(async (): Promise<CancelPaidSaleOutcome> => CANCELLED);
    const { screen } = await renderScreen({
      currentSale: async () => SALE_WITH_POINT_PAYMENT,
      cancelPaidSale,
    });

    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    const dialog = screen.getByRole("dialog", { name: "¿Cancelar la venta?" });
    await expect
      .element(dialog.getByText("Reembolso pendiente del pago con la terminal por $ 600,00"))
      .toBeVisible();
    await expect
      .element(
        dialog.getByText(
          "La nube lo envía a Mercado Pago cuando alguien lo confirma en el backoffice.",
        ),
      )
      .toBeVisible();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });

  it("cancels it and shows the pending refund once cancelled", async () => {
    const cancelPaidSale = vi.fn(
      async (): Promise<CancelPaidSaleOutcome> => ({
        kind: "cancelled",
        refunds: [POINT_REFUND],
        authorized_by: null,
      }),
    );
    const { screen } = await renderScreen({
      currentSale: readingFirst(SALE_WITH_POINT_PAYMENT, null),
      cancelPaidSale,
    });
    await expect.element(screen.getByText("Yerba mate 1 kg")).toBeVisible();
    await screen.getByRole("button", { name: "Cancelar venta" }).click();

    await screen.getByRole("button", { name: "Cancelar la venta" }).click();

    expect(cancelPaidSale).toHaveBeenCalledExactlyOnceWith("sale-1", undefined);
    const cancelled = screen.getByRole("dialog", { name: "Venta cancelada" });
    await expect
      .element(cancelled.getByText("Reembolso pendiente del pago con la terminal por $ 600,00"))
      .toBeVisible();
  });
});
