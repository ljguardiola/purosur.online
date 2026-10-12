import type { PaymentMethodAvailability } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  AVAILABLE,
  chooseQr,
  QR_ORDER_SHOWN,
  QR_PAYMENT_ID,
  readsInTurn,
  renderScreen,
  SALE_OF_ONE_LINE,
  saleWithChargeInProgress,
} from "./test-support/charge-screen";

const NEXT_ASK_TIMEOUT_MS = 5_000;

describe("ChargeScreen · QR de Mercado Pago", () => {
  it("offers the QR after the terminal and before the transfer when the core answers it is available", async () => {
    const { screen } = await renderScreen({ paymentMethodAvailability: async () => AVAILABLE });

    await expect.element(screen.getByRole("radio", { name: "QR de Mercado Pago" })).toBeEnabled();
    await expect
      .element(screen.getByText("El cliente escanea el QR · requiere internet"))
      .toBeVisible();
    const methods = screen.getByRole("radiogroup", { name: "Medio de pago" }).element();
    expect(methods.textContent).toMatch(
      /Efectivo.*Point integrada.*QR de Mercado Pago.*Transferencia/s,
    );
    await expectNoAccessibilityViolations(screen.container);
  });

  it("opens the wait for the QR charge the open sale has in progress, and follows it", async () => {
    const { screen, followMercadoPagoCharge } = await renderScreen({
      currentSale: async () => ({
        ...SALE_OF_ONE_LINE,
        lines_lock: "mercado_pago_charge_in_progress",
        cancel_refusal: "mercado_pago_charge_in_progress",
        mercado_pago_charge_in_progress: {
          payment_transaction_id: QR_PAYMENT_ID,
          method: "QR",
          amount: 476_000,
          remaining_seconds: 120,
        },
      }),
    });

    await expect
      .element(screen.getByRole("heading", { name: "Esperando el pago del cliente" }))
      .toBeVisible();
    await expect.poll(() => followMercadoPagoCharge.mock.calls[0]).toEqual([QR_PAYMENT_ID]);
  });

  describe("following the QR charge the open sale has in progress", () => {
    it("shows the customer paid until Continuar, then the completed sale, after the sale stops being open", async () => {
      const { screen, currentSale } = await renderScreen({
        currentSale: readsInTurn(saleWithChargeInProgress("QR", 120), null),
        followMercadoPagoCharge: async () => ({
          kind: "completed",
          sale_id: "sale-1",
          total: 476_000,
        }),
      });

      await expect
        .element(screen.getByRole("heading", { name: "El cliente pagó el QR" }))
        .toBeVisible();
      await expect
        .poll(() => currentSale.mock.calls.length, { timeout: NEXT_ASK_TIMEOUT_MS })
        .toBeGreaterThan(1);
      await expect
        .element(screen.getByRole("heading", { name: "El cliente pagó el QR" }))
        .toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    });

    it("keeps the declined notice after the sale stops showing the charge", async () => {
      const { screen, currentSale } = await renderScreen({
        currentSale: readsInTurn(saleWithChargeInProgress("QR", 120), SALE_OF_ONE_LINE),
        followMercadoPagoCharge: async () => ({ kind: "declined" }),
      });

      await expect
        .element(screen.getByRole("heading", { name: "Mercado Pago rechazó el pago" }))
        .toBeVisible();
      await expect
        .poll(() => currentSale.mock.calls.length, { timeout: NEXT_ASK_TIMEOUT_MS })
        .toBeGreaterThan(1);
      await expect
        .element(screen.getByRole("heading", { name: "Mercado Pago rechazó el pago" }))
        .toBeVisible();
    });
  });

  it.each<[string, () => Promise<PaymentMethodAvailability | null>]>([
    ["is still loading", () => new Promise(() => {})],
    ["could not be read", async () => null],
  ])(
    "offers no QR while the availability %s, without blaming the connection",
    async (_state, paymentMethodAvailability) => {
      const { screen } = await renderScreen({ paymentMethodAvailability });

      await expect.element(screen.getByRole("radio", { name: "Efectivo" })).toBeVisible();
      await expect
        .element(screen.getByRole("radio", { name: "QR de Mercado Pago" }))
        .not.toBeInTheDocument();
      await expect.element(screen.getByText("No disponible sin conexión")).not.toBeInTheDocument();
    },
  );

  it("shows the QR as unavailable without a connection, and does not open it", async () => {
    const { screen, startMercadoPagoCharge } = await renderScreen({
      paymentMethodAvailability: async () => ({ ...AVAILABLE, qr: "offline", point: "offline" }),
    });

    await expect.element(screen.getByRole("radio", { name: "QR de Mercado Pago" })).toBeDisabled();
    await expect.element(screen.getByText("No disponible sin conexión").first()).toBeVisible();
    await expect
      .element(screen.getByText("El cliente escanea el QR · requiere internet"))
      .not.toBeInTheDocument();
    await userEvent.click(screen.getByText("QR de Mercado Pago", { exact: true }), { force: true });
    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "¿Cuánto se cobra con QR?" }))
      .not.toBeInTheDocument();
    expect(startMercadoPagoCharge).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("asks how much is charged by QR when it is chosen", async () => {
    const { screen } = await renderScreen();

    await chooseQr(screen);

    await expect
      .element(screen.getByRole("heading", { name: "¿Cuánto se cobra con QR?" }))
      .toBeVisible();
  });

  it("creates the order for the sale and waits for the customer's payment", async () => {
    const { screen, startMercadoPagoCharge } = await renderScreen();

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    await expect
      .element(screen.getByRole("heading", { name: "Esperando el pago del cliente" }))
      .toBeVisible();
    expect(startMercadoPagoCharge).toHaveBeenCalledExactlyOnceWith("sale-1", "QR", 476_000);
  });

  it("returns to the methods from Cambiar de medio of the amount step", async () => {
    const { screen } = await renderScreen();

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "¿Cuánto se cobra con QR?" }))
      .not.toBeInTheDocument();
  });

  it("follows the order the core created and shows the sale as completed with the QR charge once approved", async () => {
    const { screen, followMercadoPagoCharge, receiptPrintStatus } = await renderScreen({
      followMercadoPagoCharge: async () => ({
        kind: "completed",
        sale_id: "sale-1",
        total: 476_000,
      }),
    });

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await expect
      .element(screen.getByText("VENTA COMPLETADA"), { timeout: NEXT_ASK_TIMEOUT_MS })
      .toBeVisible();
    await expect
      .element(screen.getByRole("dialog").getByText("QR de Mercado Pago", { exact: true }))
      .toBeVisible();
    expect(followMercadoPagoCharge).toHaveBeenCalledWith(QR_PAYMENT_ID);
    await expect.poll(() => receiptPrintStatus.mock.calls).toEqual([["sale-1"]]);
  });

  it("shows the customer paid and keeps the sale open until Continuar is pressed", async () => {
    const { screen } = await renderScreen({
      followMercadoPagoCharge: async () => ({
        kind: "completed",
        sale_id: "sale-1",
        total: 476_000,
      }),
    });

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    await expect
      .element(screen.getByRole("heading", { name: "El cliente pagó el QR" }), {
        timeout: NEXT_ASK_TIMEOUT_MS,
      })
      .toBeVisible();
    await expect.element(screen.getByText("VENTA COMPLETADA")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
      .toBeVisible();
  });

  it("charges only the amount of the order when it is the one completed", async () => {
    const { screen } = await renderScreen({
      startMercadoPagoCharge: async () => ({ ...QR_ORDER_SHOWN, amount: 300_000 }),
      followMercadoPagoCharge: async () => ({
        kind: "completed",
        sale_id: "sale-1",
        total: 476_000,
      }),
    });

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await expect
      .element(screen.getByText("VENTA COMPLETADA"), { timeout: NEXT_ASK_TIMEOUT_MS })
      .toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
  });

  it("goes back to the methods and reads the sale again after a declined order, from Elegir otro medio", async () => {
    const { screen, currentSale } = await renderScreen({
      followMercadoPagoCharge: async () => ({ kind: "declined" }),
    });
    await expect.element(screen.getByRole("radio", { name: "Efectivo" })).toBeVisible();
    const readsBefore = currentSale.mock.calls.length;

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));
    await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Mercado Pago rechazó el pago" }))
      .not.toBeInTheDocument();
    expect(currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it("goes back to the methods with the balance the core now answers after the order paid part of the sale", async () => {
    const reads = [SALE_OF_ONE_LINE, { ...SALE_OF_ONE_LINE, paid: 300_000, pending: 176_000 }];
    const { screen } = await renderScreen({
      currentSale: async () =>
        reads.shift() ?? { ...SALE_OF_ONE_LINE, paid: 300_000, pending: 176_000 },
      followMercadoPagoCharge: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 300_000,
        pending: 176_000,
      }),
    });

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }), {
        timeout: NEXT_ASK_TIMEOUT_MS,
      })
      .toBeVisible();
    await expect.element(screen.getByText("$ 1.760,00").first()).toBeVisible();
  });

  describe("abandoning the order to charge another way", () => {
    async function waitForOrder(
      overrides: Parameters<typeof renderScreen>[0] = {},
      shown = "Esperando el pago del cliente",
    ) {
      const rendered = await renderScreen(overrides);
      await chooseQr(rendered.screen);
      await userEvent.click(rendered.screen.getByRole("button", { name: "Crear orden" }));
      await expect.element(rendered.screen.getByRole("heading", { name: shown })).toBeVisible();
      return rendered;
    }

    const abandon = () =>
      userEvent.click(page.getByRole("button", { name: "Cobrar con otro medio" }));

    it("asks the core to abandon the order and goes back to the methods with a notice once it is cancelled", async () => {
      const { screen, abandonMercadoPagoCharge, currentSale } = await waitForOrder();
      const readsBefore = currentSale.mock.calls.length;

      await abandon();

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      await expect
        .element(screen.getByRole("status").getByText("Se canceló la orden QR."))
        .toBeVisible();
      expect(abandonMercadoPagoCharge).toHaveBeenCalledExactlyOnceWith(QR_PAYMENT_ID);
      expect(currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
      await expectNoAccessibilityViolations(screen.container);
    });

    it("goes back to the methods from Elegir otro medio once Mercado Pago says the order expired, without cancelling it", async () => {
      const { screen, abandonMercadoPagoCharge, currentSale } = await waitForOrder(
        { followMercadoPagoCharge: async () => ({ kind: "wait_over" }) },
        "Venció la espera del QR",
      );
      const readsBefore = currentSale.mock.calls.length;

      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      expect(abandonMercadoPagoCharge).not.toHaveBeenCalled();
      expect(currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
    });

    it("cancels the order from Elegir otro medio when the expiry could not be confirmed", async () => {
      const { screen, abandonMercadoPagoCharge } = await waitForOrder(
        { followMercadoPagoCharge: async () => ({ kind: "expiry_unconfirmed" }) },
        "No se pudo confirmar el vencimiento del QR",
      );

      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      await expect
        .element(screen.getByRole("status").getByText("Se canceló la orden QR."))
        .toBeVisible();
      expect(abandonMercadoPagoCharge).toHaveBeenCalledExactlyOnceWith(QR_PAYMENT_ID);
    });

    it("shows the customer paid and then the sale as completed with the QR charge from Continuar", async () => {
      const { screen, receiptPrintStatus } = await waitForOrder({
        abandonMercadoPagoCharge: async () => ({
          kind: "already_paid",
          settlement: { kind: "completed", sale_id: "sale-1", total: 476_000 },
        }),
      });

      await abandon();

      await expect
        .element(screen.getByRole("heading", { name: "El cliente pagó el QR" }))
        .toBeVisible();
      await expect.element(screen.getByText("El cliente ya pagó")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
      await expect.poll(() => receiptPrintStatus.mock.calls).toEqual([["sale-1"]]);
    });

    it("shows the customer paid and goes back to the methods with the balance from Continuar after a partial payment", async () => {
      const reads = [SALE_OF_ONE_LINE, { ...SALE_OF_ONE_LINE, paid: 300_000, pending: 176_000 }];
      const { screen } = await waitForOrder({
        currentSale: async () =>
          reads.shift() ?? { ...SALE_OF_ONE_LINE, paid: 300_000, pending: 176_000 },
        abandonMercadoPagoCharge: async () => ({
          kind: "already_paid",
          settlement: {
            kind: "partially_paid",
            sale_id: "sale-1",
            total: 476_000,
            paid: 300_000,
            pending: 176_000,
          },
        }),
      });

      await abandon();

      await expect
        .element(screen.getByRole("heading", { name: "El cliente pagó el QR" }))
        .toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      await expect.element(screen.getByText("El cliente ya pagó")).not.toBeInTheDocument();
      await expect.element(screen.getByText("$ 1.760,00").first()).toBeVisible();
    });

    it("says the order was already closed and goes back to the methods from Elegir otro medio", async () => {
      const { screen } = await waitForOrder({
        abandonMercadoPagoCharge: async () => ({ kind: "closed" }),
      });

      await abandon();
      await expect
        .element(screen.getByRole("heading", { name: "La orden QR ya estaba cerrada" }))
        .toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      await expect
        .element(screen.getByRole("status").getByText("Se canceló la orden QR."))
        .not.toBeInTheDocument();
    });

    it("warns that the cancellation could not be confirmed before the sale is completed another way", async () => {
      const { screen } = await waitForOrder({
        abandonMercadoPagoCharge: async () => ({ kind: "replaced" }),
      });

      await abandon();
      await expect
        .element(
          screen.getByRole("heading", { name: "No se pudo confirmar la cancelación del QR" }),
        )
        .toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      await expect
        .element(screen.getByRole("status").getByText("Se canceló la orden QR."))
        .not.toBeInTheDocument();
    });

    it("goes back to the methods to read the sale again when the order is not pending", async () => {
      const { screen, currentSale } = await waitForOrder({
        abandonMercadoPagoCharge: async () => ({ kind: "not_pending" }),
      });
      const readsBefore = currentSale.mock.calls.length;

      await abandon();

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      expect(currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
    });

    it("asks the application to check the session when abandoning finds it is no longer valid", async () => {
      const { onSessionInvalid } = await waitForOrder({
        abandonMercadoPagoCharge: async () => ({ kind: "not_signed_in" }),
      });

      await abandon();

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    });
  });
});
