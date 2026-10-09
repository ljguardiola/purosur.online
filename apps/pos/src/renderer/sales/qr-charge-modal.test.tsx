import type { StartMercadoPagoQrChargeOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { QrChargeModal } from "./qr-charge-modal";

const TOTAL = 5_070_000;
const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
const ORDER_SHOWN: StartMercadoPagoQrChargeOutcome = {
  kind: "order_shown",
  payment_transaction_id: PAYMENT_ID,
  amount: TOTAL,
  remaining_seconds: 180,
  wait_seconds: 180,
};

const AMOUNT_FIELD = "Importe a cobrar con este medio";
const WHOLE_SALE = { total: TOTAL, paid: 0, pending: TOTAL };

type Start = (amount: number) => Promise<StartMercadoPagoQrChargeOutcome>;

async function renderModal(
  start: Start = async () => ORDER_SHOWN,
  sale: { total: number; paid: number; pending: number } = WHOLE_SALE,
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const startCharge = vi.fn(start);
  const callbacks = {
    onChooseAnotherMethod: vi.fn(),
    onOrderShown: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(<QrChargeModal {...sale} start={startCharge} {...callbacks} />);
  return {
    screen,
    startCharge,
    callbacks,
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    create: screen.getByRole("button", { name: "Crear orden" }),
  };
}

describe("QrChargeModal", () => {
  it("asks how much is charged by QR and shows what is owed", async () => {
    const { screen } = await renderModal(undefined, {
      total: TOTAL,
      paid: 1_000_000,
      pending: 4_070_000,
    });

    await expect.element(screen.getByText("QR DE MERCADO PAGO")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "¿Cuánto se cobra con QR?" }))
      .toBeVisible();
    await expect.element(screen.getByText("Total de la venta")).toBeVisible();
    await expect.element(screen.getByText("$ 50.700,00")).toBeVisible();
    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
    await expect.element(screen.getByText("Saldo pendiente")).toBeVisible();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("La orden se crea por este importe. Después ya no se puede cambiar.");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("fills the amount with the pending balance and says it may be less", async () => {
    const { screen, field } = await renderModal(undefined, {
      total: TOTAL,
      paid: 1_000_000,
      pending: 4_070_000,
    });

    await expect.element(field).toHaveValue("40.700,00");
    await expect
      .element(
        screen.getByText(
          "Hasta el saldo pendiente, $ 40.700,00. Si cobrás menos, el resto queda pendiente para otro medio.",
        ),
      )
      .toBeVisible();
  });

  it("creates the order for the amount the cashier typed, once, and reports it shown", async () => {
    const { field, create, startCharge, callbacks } = await renderModal();

    await userEvent.fill(field, "30.000,00");
    await userEvent.click(create);

    await expect.poll(() => callbacks.onOrderShown.mock.calls).toEqual([[ORDER_SHOWN]]);
    expect(startCharge).toHaveBeenCalledExactlyOnceWith(3_000_000);
  });

  it("creates nothing until Crear orden is pressed", async () => {
    const { startCharge } = await renderModal();

    expect(startCharge).not.toHaveBeenCalled();
  });

  it("does not create an order for what is not an amount, and says so", async () => {
    const { screen, field, create, startCharge } = await renderModal();

    await userEvent.fill(field, "abc");
    await userEvent.click(create);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    expect(startCharge).not.toHaveBeenCalled();
  });

  it("says the amount cannot exceed the pending balance the core answers", async () => {
    const { screen, field, create } = await renderModal(async () => ({
      kind: "exceeds_pending",
      pending: 4_070_000,
    }));

    await userEvent.fill(field, "60.000,00");
    await userEvent.click(create);

    await expect
      .element(screen.getByText("No puede superar el saldo pendiente de $ 40.700,00."))
      .toBeVisible();
  });

  it("says Mercado Pago could not create the order, keeping the way to another method", async () => {
    const { screen, create, callbacks } = await renderModal(async () => ({
      kind: "order_refused",
    }));

    await userEvent.click(create);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Mercado Pago no pudo crear la orden. Cobrá con otro medio.");
    await expect.element(create).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));
    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(callbacks.onOrderShown).not.toHaveBeenCalled();
  });

  it("says the order could not be created because the register cannot reach the cloud", async () => {
    const { screen, create } = await renderModal(async () => ({ kind: "unreachable" }));

    await userEvent.click(create);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(
        "No se pudo crear la orden porque la caja no llega a la nube. Cobrá con otro medio.",
      );
    await expect.element(create).toBeEnabled();
  });

  it("says the order could not be created when the core cannot answer", async () => {
    const { screen, create } = await renderModal(async () => {
      throw new Error("core down");
    });

    await userEvent.click(create);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo crear la orden. Probá de nuevo.");
  });

  it.each([
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "no_buyer_identification_threshold" },
    { kind: "reaches_buyer_identification_threshold", threshold: 1_000_000 },
  ] as const)(
    "leaves the charge when the sale can no longer be charged ($kind)",
    async (outcome) => {
      const { create, callbacks } = await renderModal(async () => outcome);

      await userEvent.click(create);

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    },
  );

  it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
    "leaves the charge when the session is no longer valid ($kind)",
    async (outcome) => {
      const { create, callbacks } = await renderModal(async () => outcome);

      await userEvent.click(create);

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("goes back to the methods from Cambiar de medio", async () => {
    const { screen, callbacks, startCharge } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(startCharge).not.toHaveBeenCalled();
  });
});
