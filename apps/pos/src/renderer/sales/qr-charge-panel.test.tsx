import type { StartMercadoPagoChargeOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { QrChargePanel } from "./qr-charge-panel";

const TOTAL = 5_070_000;
const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
const ORDER_SHOWN: StartMercadoPagoChargeOutcome = {
  kind: "order_shown",
  payment_transaction_id: PAYMENT_ID,
  amount: TOTAL,
  remaining_seconds: 180,
  wait_seconds: 180,
};

const AMOUNT_FIELD = "IMPORTE";
const MINIMUM = 1500;
const WHOLE_SALE = { pending: TOTAL };

type Start = (amount: number) => Promise<StartMercadoPagoChargeOutcome>;

async function renderModal(
  start: Start = async () => ORDER_SHOWN,
  sale: { pending: number } = WHOLE_SALE,
  regenerate?: number,
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
    <QrChargePanel
      {...sale}
      {...(regenerate === undefined ? {} : { regenerate })}
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
    create: screen.getByRole("button", { name: "Crear orden" }),
  };
}

describe("QrChargePanel", () => {
  it("shows what is to be charged as a panel titled QR, with the amount to create the order for and the notice that it cannot be changed later", async () => {
    const { screen, field } = await renderModal(undefined, { pending: 4_070_000 });

    await expect.element(screen.getByRole("complementary", { name: "Cobro con QR" })).toBeVisible();
    await expect.element(screen.getByRole("heading", { level: 2, name: "QR" })).toBeVisible();
    await expect.element(screen.getByText("A COBRAR")).toBeVisible();
    await expect.element(screen.getByText("$ 40.700,00", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("La orden se crea por este importe. Después ya no se puede cambiar.");
    await expect.element(field).toHaveAttribute("inputmode", "decimal");
    await expectNoAccessibilityViolations(screen.container);
  });

  it("fills the amount with the pending balance, focused, with no summary of the sale and no hint under the field", async () => {
    const { screen, field } = await renderModal(undefined, { pending: 4_070_000 });

    await expect.element(field).toHaveValue("40.700,00");
    await expect.element(field).toHaveFocus();
    for (const text of [
      "Total de la venta",
      "Pagado",
      "Saldo pendiente",
      "Si cobrás menos, el resto queda pendiente para otro medio.",
      "¿Cuánto se cobra con QR?",
      "QR DE MERCADO PAGO",
    ]) {
      await expect.element(screen.getByText(text)).not.toBeInTheDocument();
    }
  });

  it("shows the keys of the panel and none of Tab or F1", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByRole("button", { name: "Crear orden" })).toBeVisible();
    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(expect.arrayContaining(["Esc", "Enter"]));
    expect(keys).not.toContain("F1");
    expect(keys).not.toContain("Tab");
    await expect
      .element(screen.getByRole("button", { name: "Cambiar de medio" }))
      .toHaveTextContent("Esc");
  });

  it("creates the order with Enter", async () => {
    const { callbacks, startCharge } = await renderModal();

    await userEvent.keyboard("{Enter}");

    await expect.poll(() => callbacks.onOrderShown.mock.calls).toEqual([[ORDER_SHOWN]]);
    expect(startCharge).toHaveBeenCalledExactlyOnceWith(TOTAL);
  });

  it("goes back to the methods with Esc", async () => {
    const { callbacks, startCharge } = await renderModal();

    await userEvent.keyboard("{Escape}");

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(startCharge).not.toHaveBeenCalled();
  });

  it("neither goes back with Esc nor from its button while the order is being created", async () => {
    const { screen, callbacks } = await renderModal(() => new Promise(() => {}));

    await userEvent.keyboard("{Enter}");
    await expect.element(screen.getByRole("button", { name: "Cambiar de medio" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");

    expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
  });

  describe("regenerating", () => {
    it("fills the amount with the one to regenerate and creates the order once on its own", async () => {
      const { field, startCharge, callbacks } = await renderModal(
        undefined,
        { pending: TOTAL },
        3_000_000,
      );

      await expect.element(field).toHaveValue("30.000,00");
      await expect.poll(() => callbacks.onOrderShown.mock.calls).toEqual([[ORDER_SHOWN]]);
      expect(startCharge).toHaveBeenCalledExactlyOnceWith(3_000_000);
    });

    it("shows a refusal of the regenerated order with the way to another method", async () => {
      const { screen, callbacks } = await renderModal(
        async () => ({ kind: "order_refused" }),
        { pending: TOTAL },
        3_000_000,
      );

      await expect
        .element(screen.getByRole("alert"))
        .toHaveTextContent("Mercado Pago no pudo crear la orden. Cobrá con otro medio.");
      await userEvent.keyboard("{Enter}");
      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    });
  });

  it("creates the order for the amount the cashier typed, once, and reports it shown", async () => {
    const { field, create, startCharge, callbacks } = await renderModal();

    await userEvent.fill(field, "30000,00");
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

    await userEvent.clear(field);
    await userEvent.keyboard("5,");
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

    await userEvent.fill(field, "60000,00");
    await userEvent.click(create);

    await expect
      .element(screen.getByText("No puede superar el saldo pendiente de $ 40.700,00."))
      .toBeVisible();
  });

  it("says the QR does not accept charges under its minimum", async () => {
    const { screen, field, create } = await renderModal(async () => ({ kind: "below_minimum" }));

    await userEvent.fill(field, "10,00");
    await userEvent.click(create);

    await expect
      .element(screen.getByText("El QR no acepta cobros menores a $ 15,00"))
      .toBeVisible();
    await expect.element(create).toBeEnabled();
  });

  it("says Mercado Pago could not create the order, keeping the way to another method", async () => {
    const { screen, create, callbacks } = await renderModal(async () => ({
      kind: "order_refused",
    }));

    await userEvent.click(create);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Mercado Pago no pudo crear la orden. Cobrá con otro medio.");
    await expect.element(create).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());
    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(callbacks.onOrderShown).not.toHaveBeenCalled();
  });

  it("says another QR charge of the sale is still waiting, keeping the way to another method", async () => {
    const { screen, create, callbacks } = await renderModal(async () => ({
      kind: "mercado_pago_charge_in_progress",
    }));

    await userEvent.click(create);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Ya hay un cobro con Mercado Pago en curso para esta venta.");
    await expect.element(create).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());
    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(callbacks.onOrderShown).not.toHaveBeenCalled();
  });

  it("says the paid order of the sale must be applied first, keeping the way to another method", async () => {
    const { screen, create, callbacks } = await renderModal(async () => ({
      kind: "paid_order_not_applied",
    }));

    await userEvent.click(create);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Aplicá primero el pago de Mercado Pago de esta venta.");
    await expect.element(create).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
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
    await expect.element(create).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Cambiar de medio" }).last())
      .toHaveTextContent("Enter");
  });

  it("clears a refusal and offers Crear orden again when the amount is edited", async () => {
    const { screen, field, create } = await renderModal(async () => ({ kind: "order_refused" }));
    await userEvent.click(create);
    await expect.element(screen.getByRole("alert")).toBeVisible();

    await userEvent.type(field, "0");

    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
    await expect.element(create).toBeVisible();
  });

  it("says the order could not be created when the core cannot answer", async () => {
    const { screen, create } = await renderModal(async () => {
      throw new Error("core down");
    });

    await userEvent.click(create);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo crear la orden. Probá de nuevo.");
    await expect.element(create).toBeEnabled();
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

  it("groups thousands and takes a typed dot as the decimal comma", async () => {
    const { field } = await renderModal();
    await userEvent.clear(field);
    await userEvent.type(field, "1234.5");

    await expect.element(field).toHaveValue("1.234,5");
  });
});
