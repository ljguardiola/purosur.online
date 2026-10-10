import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseQr,
  QR_ORDER_SHOWN,
  QR_PAYMENT_ID,
  renderScreen,
  SALE_OF_ONE_LINE,
} from "./test-support/charge-screen";

const NEXT_ASK_TIMEOUT_MS = 5_000;

describe("ChargeScreen · QR de Mercado Pago", () => {
  it("offers the QR between cash and transfer when the core can reach the cloud", async () => {
    const { screen } = await renderScreen({ mercadoPagoQr: "available" });

    await expect.element(screen.getByRole("radio", { name: "QR de Mercado Pago" })).toBeEnabled();
    await expect
      .element(screen.getByText("El cliente escanea el QR · requiere internet"))
      .toBeVisible();
    const labels = screen
      .getByRole("radio")
      .elements()
      .map((radio) => radio.textContent);
    expect(labels).toEqual([
      expect.stringContaining("Efectivo"),
      expect.stringContaining("QR de Mercado Pago"),
      expect.stringContaining("Transferencia"),
    ]);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the QR as unavailable without a connection, and does not open it", async () => {
    const { screen, startMercadoPagoQrCharge } = await renderScreen({
      mercadoPagoQr: "unavailable",
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
    await expect.element(screen.getByText("QR de Mercado Pago", { exact: true })).toBeVisible();
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
});
