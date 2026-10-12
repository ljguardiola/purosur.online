import type { FollowMercadoPagoChargeOutcome, PaymentMethodAvailability } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  AVAILABLE,
  choosePoint,
  POINT_ORDER_SHOWN,
  POINT_PAYMENT_ID,
  renderScreen,
  SALE_OF_ONE_LINE,
} from "./test-support/charge-screen";

const NEXT_ASK_TIMEOUT_MS = 5_000;

describe("ChargeScreen · Point integrada", () => {
  it("offers the terminal after cash and before the QR when the core answers it is available", async () => {
    const { screen } = await renderScreen();

    await expect.element(screen.getByRole("radio", { name: "Point integrada" })).toBeEnabled();
    await expect
      .element(screen.getByText("Débito o crédito en la terminal · requiere internet"))
      .toBeVisible();
    const methods = screen.getByRole("radiogroup", { name: "Medio de pago" }).element();
    expect(methods.textContent).toMatch(/Efectivo.*Point integrada.*QR de Mercado Pago/s);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the terminal and the QR as unavailable without a connection, and opens neither", async () => {
    const { screen, startMercadoPagoCharge } = await renderScreen({
      paymentMethodAvailability: async () => ({ ...AVAILABLE, qr: "offline", point: "offline" }),
    });

    await expect.element(screen.getByRole("radio", { name: "Point integrada" })).toBeDisabled();
    await expect.element(screen.getByRole("radio", { name: "QR de Mercado Pago" })).toBeDisabled();
    expect(screen.getByText("No disponible sin conexión").elements()).toHaveLength(2);
    await userEvent.click(screen.getByText("Point integrada", { exact: true }), { force: true });
    await expect
      .element(screen.getByRole("heading", { name: "¿Cuánto se cobra con la Point?" }))
      .not.toBeInTheDocument();
    expect(startMercadoPagoCharge).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("offers no terminal below its minimum and says why, keeping the QR available", async () => {
    const { screen } = await renderScreen({
      paymentMethodAvailability: async () => ({ ...AVAILABLE, point: "below_minimum" }),
    });

    await expect.element(screen.getByRole("radio", { name: "QR de Mercado Pago" })).toBeEnabled();
    await expect
      .element(screen.getByRole("radio", { name: "Point integrada" }))
      .not.toBeInTheDocument();
    await expect
      .element(
        screen
          .getByRole("status")
          .getByText("Point integrada: no se ofrece con un total menor a $ 15,00"),
      )
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the terminal as not configured in this register", async () => {
    const { screen } = await renderScreen({
      paymentMethodAvailability: async () => ({ ...AVAILABLE, point: "not_configured" }),
    });

    await expect.element(screen.getByRole("radio", { name: "Point integrada" })).toBeDisabled();
    await expect.element(screen.getByText("No configurada en esta caja")).toBeVisible();
    await expect.element(screen.getByRole("radio", { name: "QR de Mercado Pago" })).toBeEnabled();
    await expectNoAccessibilityViolations(screen.container);
  });

  it.each<[string, () => Promise<PaymentMethodAvailability | null>]>([
    ["is still loading", () => new Promise(() => {})],
    ["could not be read", async () => null],
  ])(
    "offers no terminal and no notice while the availability %s",
    async (_state, paymentMethodAvailability) => {
      const { screen } = await renderScreen({ paymentMethodAvailability });

      await expect.element(screen.getByRole("radio", { name: "Efectivo" })).toBeVisible();
      await expect
        .element(screen.getByRole("radio", { name: "Point integrada" }))
        .not.toBeInTheDocument();
      await expect
        .element(screen.getByText(/Point integrada: no se ofrece/))
        .not.toBeInTheDocument();
    },
  );

  it("reads the availability of the sale again when it opens the methods after a partial payment", async () => {
    const { screen, paymentMethodAvailability } = await renderScreen({
      followMercadoPagoCharge: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 460_000,
        pending: 16_000,
      }),
    });
    await expect.element(screen.getByRole("radio", { name: "Efectivo" })).toBeVisible();
    const readsBefore = paymentMethodAvailability.mock.calls.length;

    await choosePoint(screen);
    await userEvent.click(screen.getByRole("button", { name: "Enviar a la terminal" }));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }), {
        timeout: NEXT_ASK_TIMEOUT_MS,
      })
      .toBeVisible();
    expect(paymentMethodAvailability.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it("asks how much is charged on the terminal when it is chosen, and returns from Cambiar de medio", async () => {
    const { screen } = await renderScreen();

    await choosePoint(screen);
    await expect
      .element(screen.getByRole("heading", { name: "¿Cuánto se cobra con la Point?" }))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect
      .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "¿Cuánto se cobra con la Point?" }))
      .not.toBeInTheDocument();
  });

  it("sends the sale to the terminal and waits for the customer to pay there", async () => {
    const { screen, startMercadoPagoCharge } = await renderScreen({
      startMercadoPagoCharge: async () => POINT_ORDER_SHOWN,
    });

    await choosePoint(screen);
    await userEvent.click(screen.getByRole("button", { name: "Enviar a la terminal" }));

    await expect
      .element(screen.getByRole("heading", { name: "El cliente paga en la terminal" }))
      .toBeVisible();
    expect(startMercadoPagoCharge).toHaveBeenCalledExactlyOnceWith("sale-1", "POINT", 476_000);
  });

  describe("waiting on the terminal", () => {
    async function waitOnTerminal(overrides: Parameters<typeof renderScreen>[0] = {}) {
      const rendered = await renderScreen({
        startMercadoPagoCharge: async () => POINT_ORDER_SHOWN,
        ...overrides,
      });
      await choosePoint(rendered.screen);
      await userEvent.click(rendered.screen.getByRole("button", { name: "Enviar a la terminal" }));
      return rendered;
    }

    it("follows the order the core created", async () => {
      const { screen, followMercadoPagoCharge } = await waitOnTerminal();

      await expect
        .element(screen.getByRole("heading", { name: "El cliente paga en la terminal" }))
        .toBeVisible();
      await expect.poll(() => followMercadoPagoCharge.mock.calls[0]).toEqual([POINT_PAYMENT_ID]);
    });

    it("goes back to the methods and reads the sale again once the order is cancelled from Cambiar de medio", async () => {
      const { screen, abandonMercadoPagoCharge, currentSale } = await waitOnTerminal();
      const readsBefore = currentSale.mock.calls.length;

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      expect(abandonMercadoPagoCharge).toHaveBeenCalledExactlyOnceWith(POINT_PAYMENT_ID);
      expect(currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
    });

    it("waits for the cancellation on the terminal when it cannot be cancelled from the register", async () => {
      const { screen } = await waitOnTerminal({
        abandonMercadoPagoCharge: async () => ({ kind: "cancel_on_terminal" }),
      });

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect
        .element(screen.getByRole("heading", { name: "Esperando la cancelación en la terminal" }))
        .toBeVisible();
    });

    it("tells the wait is over and goes back to the methods once the terminal confirms the cancellation", async () => {
      const answers: FollowMercadoPagoChargeOutcome[] = [
        { kind: "at_terminal_wait_over" },
        { kind: "at_terminal_wait_over" },
        { kind: "closed" },
      ];
      const { screen } = await waitOnTerminal({
        followMercadoPagoCharge: async () => answers.shift() ?? { kind: "closed" },
      });

      await expect
        .element(screen.getByRole("heading", { name: "Se terminó el tiempo de espera" }), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Elegir otro medio" }), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeEnabled();
      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
    });

    it("goes back to the methods from Elegir otro medio once the terminal declines the payment", async () => {
      const { screen, currentSale } = await waitOnTerminal({
        followMercadoPagoCharge: async () => ({ kind: "declined" }),
      });
      const readsBefore = currentSale.mock.calls.length;

      await expect
        .element(screen.getByRole("heading", { name: "La terminal rechazó el pago" }))
        .toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      expect(currentSale.mock.calls.length).toBeGreaterThan(readsBefore);
    });

    it("shows the sale as completed with the terminal charge once the customer paid", async () => {
      const { screen, receiptPrintStatus } = await waitOnTerminal({
        followMercadoPagoCharge: async () => ({
          kind: "completed",
          sale_id: "sale-1",
          total: 476_000,
        }),
      });

      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
      await expect
        .element(screen.getByRole("dialog").getByText("Point integrada", { exact: true }))
        .toBeVisible();
      await expect.poll(() => receiptPrintStatus.mock.calls).toEqual([["sale-1"]]);
    });

    it("goes back to the methods with the balance the core now answers after a partial payment", async () => {
      const reads = [SALE_OF_ONE_LINE, { ...SALE_OF_ONE_LINE, paid: 300_000, pending: 176_000 }];
      const { screen } = await waitOnTerminal({
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

      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      await expect
        .element(screen.getByRole("heading", { name: "Elegí el medio de pago" }))
        .toBeVisible();
      await expect.element(screen.getByText("$ 1.760,00").first()).toBeVisible();
    });

    it("asks the application to check the session when following finds it is no longer valid", async () => {
      const { onSessionInvalid } = await waitOnTerminal({
        followMercadoPagoCharge: async () => ({ kind: "not_signed_in" }),
      });

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    });
  });
});
