import type { StartMercadoPagoChargeOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { PointChargePanel } from "./point-charge-panel";

const TOTAL = 5_070_000;
const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000b1";
const ORDER_SHOWN: StartMercadoPagoChargeOutcome = {
  kind: "order_shown",
  payment_transaction_id: PAYMENT_ID,
  amount: TOTAL,
  remaining_seconds: 180,
  wait_seconds: 180,
};

const AMOUNT_FIELD = "IMPORTE";
const WHOLE_SALE = { total: TOTAL, paid: 0, pending: TOTAL };
const MINIMUM = 1_500;

type Start = (amount: number) => Promise<StartMercadoPagoChargeOutcome>;

async function renderPanel(
  start: Start = async () => ORDER_SHOWN,
  sale: { total: number; paid: number; pending: number } = WHOLE_SALE,
  cardType: "DEBIT" | "CREDIT" = "DEBIT",
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
    <PointChargePanel
      pending={sale.pending}
      cardType={cardType}
      minimum={MINIMUM}
      start={startCharge}
      {...callbacks}
    />,
  );
  return {
    screen,
    startCharge,
    callbacks,
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    send: screen.getByRole("button", { name: "Enviar a la terminal" }),
  };
}

function keycapOf(button: { element: () => Element }) {
  return button.element().querySelector("kbd")?.textContent;
}

describe("PointChargePanel", () => {
  it("is the Point débito charge: its title, Esc with Cambiar de medio, the amount to charge and the amount field, focused", async () => {
    const { screen, field } = await renderPanel(undefined, {
      total: TOTAL,
      paid: 1_000_000,
      pending: 4_070_000,
    });

    await expect.element(screen.getByText("Point débito", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Cambiar de medio" }).first())
      .toBeVisible();
    await expect.element(screen.getByText("A COBRAR")).toBeVisible();
    await expect.element(screen.getByText("$ 40.700,00")).toBeVisible();
    await expect.element(screen.getByText("IMPORTE")).toBeVisible();
    await expect.element(field).toHaveValue("40.700,00");
    await expect.element(field).toHaveFocus();
    await expect.element(field).toHaveAttribute("inputmode", "decimal");
    await expect.element(screen.getByText("Total de la venta")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("sends the prefilled amount to the terminal with Enter", async () => {
    const { startCharge, callbacks } = await renderPanel();

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => callbacks.onOrderShown.mock.calls).toEqual([[ORDER_SHOWN]]);
    expect(startCharge).toHaveBeenCalledExactlyOnceWith(TOTAL);
  });

  it("shows the Enter key on Enviar a la terminal", async () => {
    const { send } = await renderPanel();

    await expect.poll(() => keycapOf(send)).toBe("Enter");
  });

  it("goes back to the methods with Esc", async () => {
    const { callbacks, startCharge } = await renderPanel();

    await userEvent.keyboard("{Escape}");

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(startCharge).not.toHaveBeenCalled();
  });

  it("does not go back with Esc while the charge is being sent", async () => {
    let finish: (outcome: StartMercadoPagoChargeOutcome) => void = () => undefined;
    const { send, callbacks } = await renderPanel(
      () => new Promise<StartMercadoPagoChargeOutcome>((settle) => (finish = settle)),
    );

    await userEvent.click(send);
    await userEvent.keyboard("{Escape}");

    expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
    finish(ORDER_SHOWN);
  });

  it("names the credit card the charge is made with", async () => {
    const { screen } = await renderPanel(undefined, WHOLE_SALE, "CREDIT");

    await expect.element(screen.getByText("Point crédito", { exact: true })).toBeVisible();
  });

  it("sends the amount the cashier typed to the terminal, once, and reports the order shown", async () => {
    const { field, send, startCharge, callbacks } = await renderPanel();

    await userEvent.fill(field, "30000,00");
    await userEvent.click(send);

    await expect.poll(() => callbacks.onOrderShown.mock.calls).toEqual([[ORDER_SHOWN]]);
    expect(startCharge).toHaveBeenCalledExactlyOnceWith(3_000_000);
  });

  it("sends nothing until Enviar a la terminal is pressed", async () => {
    const { startCharge } = await renderPanel();

    expect(startCharge).not.toHaveBeenCalled();
  });

  it("does not send what is not an amount, and says so", async () => {
    const { screen, field, send, startCharge } = await renderPanel();

    await userEvent.clear(field);
    await userEvent.keyboard("5,");
    await userEvent.click(send);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    expect(startCharge).not.toHaveBeenCalled();
  });

  it("says the amount cannot exceed the pending balance the core answers", async () => {
    const { screen, field, send } = await renderPanel(async () => ({
      kind: "exceeds_pending",
      pending: 4_070_000,
    }));

    await userEvent.fill(field, "60000,00");
    await userEvent.click(send);

    await expect
      .element(screen.getByText("No puede superar el saldo pendiente de $ 40.700,00."))
      .toBeVisible();
  });

  it("says the terminal does not accept charges under its minimum", async () => {
    const { screen, field, send } = await renderPanel(async () => ({ kind: "below_minimum" }));

    await userEvent.fill(field, "10,00");
    await userEvent.click(send);

    await expect
      .element(screen.getByText("La Point no acepta cobros menores a $ 15,00"))
      .toBeVisible();
    await expect.element(send).toBeEnabled();
  });

  it.each([
    {
      outcome: { kind: "not_configured" },
      message: "La Point integrada no está configurada en esta caja.",
    },
    {
      outcome: { kind: "order_refused" },
      message: "Mercado Pago rechazó la orden. Cobrá con otro medio.",
    },
    {
      outcome: { kind: "mercado_pago_charge_in_progress" },
      message: "Ya hay un cobro con Mercado Pago en curso para esta venta.",
    },
    {
      outcome: { kind: "paid_order_not_applied" },
      message: "Aplicá primero el pago de Mercado Pago de esta venta.",
    },
  ] as const)(
    "says $outcome.kind in the panel and leaves only Cambiar de medio with Enter",
    async ({ outcome, message }) => {
      const { screen, send, callbacks } = await renderPanel(async () => outcome);

      await userEvent.click(send);

      await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
      await expect
        .element(screen.getByRole("button", { name: "Enviar a la terminal" }))
        .not.toBeInTheDocument();
      const change = screen.getByRole("button", { name: "Cambiar de medio" }).last();
      await expect.poll(() => keycapOf(change)).toBe("Enter");
      await userEvent.keyboard("{Enter}");
      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
      expect(callbacks.onOrderShown).not.toHaveBeenCalled();
    },
  );

  it("follows the charge, offering no other method, when the cloud could not confirm the order reached the terminal", async () => {
    const unconfirmed = { ...ORDER_SHOWN, kind: "order_unconfirmed" } as const;
    const { screen, send, callbacks } = await renderPanel(async () => unconfirmed);

    await userEvent.click(send);

    await expect.poll(() => callbacks.onOrderShown.mock.calls).toEqual([[unconfirmed]]);
    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    {
      when: "the core answers it could not reach the cloud",
      start: async (): Promise<StartMercadoPagoChargeOutcome> => ({ kind: "unreachable" }),
      message: "No se pudo crear la orden porque la caja no llega a la nube. Cobrá con otro medio.",
    },
    {
      when: "the core answers it is unavailable",
      start: async (): Promise<StartMercadoPagoChargeOutcome> => ({ kind: "unavailable" }),
      message: "No se pudo crear la orden. Cobrá con otro medio.",
    },
    {
      when: "the core cannot answer",
      start: async (): Promise<StartMercadoPagoChargeOutcome> => {
        throw new Error("core down");
      },
      message: "No se pudo crear la orden. Cobrá con otro medio.",
    },
  ])(
    "says the charge could not be sent when $when, and leaves only Cambiar de medio with Enter",
    async ({ start, message }) => {
      const { screen, send, startCharge, callbacks } = await renderPanel(start);

      await userEvent.click(send);

      await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
      await expect
        .element(screen.getByRole("button", { name: "Enviar a la terminal" }))
        .not.toBeInTheDocument();
      const change = screen.getByRole("button", { name: "Cambiar de medio" }).last();
      await expect.poll(() => keycapOf(change)).toBe("Enter");
      await userEvent.keyboard("{Enter}");
      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
      expect(startCharge).toHaveBeenCalledOnce();
    },
  );

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
      const { send, callbacks } = await renderPanel(async () => outcome);

      await userEvent.click(send);

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    },
  );

  it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
    "leaves the charge when the session is no longer valid ($kind)",
    async (outcome) => {
      const { send, callbacks } = await renderPanel(async () => outcome);

      await userEvent.click(send);

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("goes back to the methods from Cambiar de medio", async () => {
    const { screen, callbacks, startCharge } = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(startCharge).not.toHaveBeenCalled();
  });

  it("groups thousands and takes a typed dot as the decimal comma", async () => {
    const { field } = await renderPanel();
    await userEvent.clear(field);
    await userEvent.type(field, "1234.5");

    await expect.element(field).toHaveValue("1.234,5");
  });
});
