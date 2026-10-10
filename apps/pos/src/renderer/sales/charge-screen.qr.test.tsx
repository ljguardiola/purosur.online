import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  chooseQr,
  QR_ORDER_SHOWN,
  QR_PAYMENT_ID,
  registerStatusWithCloud,
  renderScreen,
  SALE_OF_ONE_LINE,
} from "./test-support/charge-screen";

const NEXT_ASK_TIMEOUT_MS = 5_000;

describe("ChargeScreen · QR de Mercado Pago", () => {
  it("offers the QR between cash and transfer when the core can reach the cloud", async () => {
    const { screen } = await renderScreen({
      registerStatus: registerStatusWithCloud("reachable"),
    });

    await expect.element(screen.getByRole("radio", { name: "QR de Mercado Pago" })).toBeEnabled();
    await expect
      .element(screen.getByText("El cliente escanea el QR · requiere internet"))
      .toBeVisible();
    const methods = screen.getByRole("radiogroup", { name: "Medio de pago" }).element();
    expect(methods.textContent).toMatch(/Efectivo.*QR de Mercado Pago.*Transferencia/s);
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each([
    ["is still loading", { status: "loading" }],
    ["could not be read", { status: "failed", retry: () => {} }],
  ] as const)(
    "offers no QR while the register's status %s, without blaming the connection",
    async (_state, registerStatus) => {
      const { screen } = await renderScreen({ registerStatus });

      await expect.element(screen.getByRole("radio", { name: "Efectivo" })).toBeVisible();
      await expect
        .element(screen.getByRole("radio", { name: "QR de Mercado Pago" }))
        .not.toBeInTheDocument();
      await expect.element(screen.getByText("No disponible sin conexión")).not.toBeInTheDocument();
    },
  );

  it("shows the QR as unavailable without a connection, and does not open it", async () => {
    const { screen, startMercadoPagoQrCharge } = await renderScreen({
      registerStatus: registerStatusWithCloud("unreachable"),
    });

    await expect.element(screen.getByRole("radio", { name: "QR de Mercado Pago" })).toBeDisabled();
    await expect.element(screen.getByText("No disponible sin conexión")).toBeVisible();
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
    expect(startMercadoPagoQrCharge).not.toHaveBeenCalled();
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
    const { screen, startMercadoPagoQrCharge } = await renderScreen();

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    await expect
      .element(screen.getByRole("heading", { name: "Esperando el pago del cliente" }))
      .toBeVisible();
    expect(startMercadoPagoQrCharge).toHaveBeenCalledExactlyOnceWith("sale-1", 476_000);
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
    const { screen, followMercadoPagoQrCharge, receiptPrintStatus } = await renderScreen({
      followMercadoPagoQrCharge: async () => ({
        kind: "completed",
        sale_id: "sale-1",
        total: 476_000,
      }),
    });

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    await expect
      .element(screen.getByText("VENTA COMPLETADA"), { timeout: NEXT_ASK_TIMEOUT_MS })
      .toBeVisible();
    await expect
      .element(screen.getByRole("dialog").getByText("QR de Mercado Pago", { exact: true }))
      .toBeVisible();
    expect(followMercadoPagoQrCharge).toHaveBeenCalledWith(QR_PAYMENT_ID);
    await expect.poll(() => receiptPrintStatus.mock.calls).toEqual([["sale-1"]]);
  });

  it("charges only the amount of the order when it is the one completed", async () => {
    const { screen } = await renderScreen({
      startMercadoPagoQrCharge: async () => ({ ...QR_ORDER_SHOWN, amount: 300_000 }),
      followMercadoPagoQrCharge: async () => ({
        kind: "completed",
        sale_id: "sale-1",
        total: 476_000,
      }),
    });

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

    await expect
      .element(screen.getByText("VENTA COMPLETADA"), { timeout: NEXT_ASK_TIMEOUT_MS })
      .toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
  });

  it("goes back to the methods and reads the sale again after a declined order, from Elegir otro medio", async () => {
    const { screen, currentSale } = await renderScreen({
      followMercadoPagoQrCharge: async () => ({ kind: "declined" }),
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
      followMercadoPagoQrCharge: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 300_000,
        pending: 176_000,
      }),
    });

    await chooseQr(screen);
    await userEvent.click(screen.getByRole("button", { name: "Crear orden" }));

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
      const { screen, abandonMercadoPagoQrCharge, currentSale } = await waitForOrder();
      const readsBefore = currentSale.mock.calls.length;

      await abandon();

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      await expect
        .element(screen.getByRole("status").getByText("Se canceló la orden QR."))
        .toBeVisible();
      expect(abandonMercadoPagoQrCharge).toHaveBeenCalledExactlyOnceWith(QR_PAYMENT_ID);
      expect(currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
      await expectNoAccessibilityViolations(screen.container);
    });

    it("abandons the order from Elegir otro medio once the wait ran out", async () => {
      const { screen, abandonMercadoPagoQrCharge } = await waitForOrder(
        { followMercadoPagoQrCharge: async () => ({ kind: "wait_over" }) },
        "Venció la espera del QR",
      );

      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      await expect
        .element(screen.getByRole("status").getByText("Se canceló la orden QR."))
        .toBeVisible();
      expect(abandonMercadoPagoQrCharge).toHaveBeenCalledExactlyOnceWith(QR_PAYMENT_ID);
    });

    it("tells the customer already paid and shows the sale as completed with the QR charge", async () => {
      const { screen, receiptPrintStatus } = await waitForOrder({
        abandonMercadoPagoQrCharge: async () => ({
          kind: "already_paid",
          settlement: { kind: "completed", sale_id: "sale-1", total: 476_000 },
        }),
      });

      await abandon();

      await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
      await expect.element(screen.getByText("El cliente ya pagó")).toBeVisible();
      await expect.element(screen.getByText("Mercado Pago confirmó el pago del QR.")).toBeVisible();
      await expect.poll(() => receiptPrintStatus.mock.calls).toEqual([["sale-1"]]);
    });

    it("tells the customer already paid and goes back to the methods with the balance after a partial payment", async () => {
      const reads = [SALE_OF_ONE_LINE, { ...SALE_OF_ONE_LINE, paid: 300_000, pending: 176_000 }];
      const { screen } = await waitForOrder({
        currentSale: async () =>
          reads.shift() ?? { ...SALE_OF_ONE_LINE, paid: 300_000, pending: 176_000 },
        abandonMercadoPagoQrCharge: async () => ({
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
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      await expect.element(screen.getByText("El cliente ya pagó")).toBeVisible();
      await expect.element(screen.getByText("$ 1.760,00").first()).toBeVisible();
    });

    it("says the order was already closed and goes back to the methods from Elegir otro medio", async () => {
      const { screen } = await waitForOrder({
        abandonMercadoPagoQrCharge: async () => ({ kind: "closed" }),
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
        abandonMercadoPagoQrCharge: async () => ({ kind: "replaced" }),
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
        abandonMercadoPagoQrCharge: async () => ({ kind: "not_pending" }),
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
        abandonMercadoPagoQrCharge: async () => ({ kind: "not_signed_in" }),
      });

      await abandon();

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    });
  });
});
