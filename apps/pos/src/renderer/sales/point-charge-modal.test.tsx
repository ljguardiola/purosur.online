import type { StartMercadoPagoChargeOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PointChargeModal } from "./point-charge-modal";

const TOTAL = 5_070_000;
const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000b1";
const ORDER_SHOWN: StartMercadoPagoChargeOutcome = {
  kind: "order_shown",
  payment_transaction_id: PAYMENT_ID,
  amount: TOTAL,
  remaining_seconds: 180,
};

const AMOUNT_FIELD = "Importe a cobrar con este medio";
const WHOLE_SALE = { total: TOTAL, paid: 0, pending: TOTAL };
const MINIMUM = 1_500;

type Start = (amount: number) => Promise<StartMercadoPagoChargeOutcome>;

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
  const screen = await render(
    <PointChargeModal {...sale} minimum={MINIMUM} start={startCharge} {...callbacks} />,
  );
  return {
    screen,
    startCharge,
    callbacks,
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    send: screen.getByRole("button", { name: "Enviar a la terminal" }),
  };
}

describe("PointChargeModal", () => {
  it("asks how much is charged on the terminal and shows what is owed", async () => {
    const { screen } = await renderModal(undefined, {
      total: TOTAL,
      paid: 1_000_000,
      pending: 4_070_000,
    });

    await expect.element(screen.getByText("POINT INTEGRADA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "¿Cuánto se cobra con la Point?" }))
      .toBeVisible();
    await expect.element(screen.getByText("Total de la venta")).toBeVisible();
    await expect.element(screen.getByText("$ 50.700,00")).toBeVisible();
    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
    await expect.element(screen.getByText("Saldo pendiente")).toBeVisible();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(
        "El cobro se envía a la terminal por este importe. Después ya no se puede cambiar.",
      );
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

  it("sends the amount the cashier typed to the terminal, once, and reports the order shown", async () => {
    const { field, send, startCharge, callbacks } = await renderModal();

    await userEvent.fill(field, "30.000,00");
    await userEvent.click(send);

    await expect.poll(() => callbacks.onOrderShown.mock.calls).toEqual([[ORDER_SHOWN]]);
    expect(startCharge).toHaveBeenCalledExactlyOnceWith(3_000_000);
  });

  it("sends nothing until Enviar a la terminal is pressed", async () => {
    const { startCharge } = await renderModal();

    expect(startCharge).not.toHaveBeenCalled();
  });

  it("does not send what is not an amount, and says so", async () => {
    const { screen, field, send, startCharge } = await renderModal();

    await userEvent.fill(field, "abc");
    await userEvent.click(send);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    expect(startCharge).not.toHaveBeenCalled();
  });

  it("says the amount cannot exceed the pending balance the core answers", async () => {
    const { screen, field, send } = await renderModal(async () => ({
      kind: "exceeds_pending",
      pending: 4_070_000,
    }));

    await userEvent.fill(field, "60.000,00");
    await userEvent.click(send);

    await expect
      .element(screen.getByText("No puede superar el saldo pendiente de $ 40.700,00."))
      .toBeVisible();
  });

  it("says the terminal does not accept charges under its minimum", async () => {
    const { screen, field, send } = await renderModal(async () => ({ kind: "below_minimum" }));

    await userEvent.fill(field, "10,00");
    await userEvent.click(send);

    await expect
      .element(screen.getByText("La Point no acepta cobros menores a $ 15,00"))
      .toBeVisible();
    await expect.element(send).toBeEnabled();
  });

  it("says the terminal is not configured in this register, keeping the way to another method", async () => {
    const { screen, send, callbacks } = await renderModal(async () => ({
      kind: "not_configured",
    }));

    await userEvent.click(send);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("La Point integrada no está configurada en esta caja.");
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));
    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(callbacks.onOrderShown).not.toHaveBeenCalled();
  });

  it("says Mercado Pago refused the order, keeping the way to another method", async () => {
    const { screen, send } = await renderModal(async () => ({ kind: "order_refused" }));

    await userEvent.click(send);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Mercado Pago rechazó la orden. Cobrá con otro medio.");
    await expect.element(send).toBeEnabled();
  });

  it("says another Mercado Pago charge of the sale is still waiting", async () => {
    const { screen, send } = await renderModal(async () => ({
      kind: "mercado_pago_charge_in_progress",
    }));

    await userEvent.click(send);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Ya hay un cobro con Mercado Pago en curso para esta venta.");
  });

  it("says the charge could not be sent because the register cannot reach the cloud", async () => {
    const { screen, send } = await renderModal(async () => ({ kind: "unreachable" }));

    await userEvent.click(send);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent(
        "No se pudo crear la orden porque la caja no llega a la nube. Cobrá con otro medio.",
      );
  });

  it("says the charge could not be sent when the core cannot answer", async () => {
    const { screen, send } = await renderModal(async () => {
      throw new Error("core down");
    });

    await userEvent.click(send);

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
      const { send, callbacks } = await renderModal(async () => outcome);

      await userEvent.click(send);

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    },
  );

  it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
    "leaves the charge when the session is no longer valid ($kind)",
    async (outcome) => {
      const { send, callbacks } = await renderModal(async () => outcome);

      await userEvent.click(send);

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
