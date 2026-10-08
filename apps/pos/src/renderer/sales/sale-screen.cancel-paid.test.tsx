import type { CancelPaidSaleOutcome, CurrentSaleAnswer, OpenSale } from "@purosur/contracts";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { renderScreen, SALE_OF_YERBA } from "./test-support/sale-screen";

const CASH_REFUND = {
  payment_id: "p1",
  method: "CASH",
  amount: 100_000,
  state: "APPROVED",
} as const;
const PAID_SALE: OpenSale = {
  ...SALE_OF_YERBA,
  paid: 100_000,
  pending: 376_000,
  lines_editable: false,
  cancellable: false,
  refunds_on_cancel: [CASH_REFUND],
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

    await expect.element(screen.getByText("Sin pagos")).toBeVisible();
    expect(cancelPaidSale).not.toHaveBeenCalled();
  });
});
