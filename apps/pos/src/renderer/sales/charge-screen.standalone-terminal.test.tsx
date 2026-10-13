import type { PaymentMethodAvailability } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
  chooseStandaloneTerminal,
  renderScreen,
  SALE_OF_ONE_LINE,
  SALE_WITH_PART_PAID,
} from "./test-support/charge-screen";

const REGISTER = "Registrar pago aprobado";
const AMOUNT_FIELD = "Importe a cobrar con este medio";

describe("ChargeScreen · terminal independiente", () => {
  it.each([
    [
      "online",
      async (): Promise<PaymentMethodAvailability | null> => ({
        qr: "available",
        point: "available",
        point_minimum: 1500,
      }),
    ],
    [
      "offline",
      async (): Promise<PaymentMethodAvailability | null> => ({
        qr: "offline",
        point: "offline",
        point_minimum: 1500,
      }),
    ],
    ["still loading", () => new Promise<PaymentMethodAvailability | null>(() => {})],
  ] as const)(
    "offers the standalone terminal, enabled and last, while the availability is %s",
    async (_state, paymentMethodAvailability) => {
      const { screen } = await renderScreen({ paymentMethodAvailability });

      await expect
        .element(screen.getByRole("radio", { name: "Terminal independiente" }))
        .toBeEnabled();
      await expect
        .element(screen.getByText("Segunda Point · cargás el resultado a mano"))
        .toBeVisible();
      const methods = screen.getByRole("radiogroup", { name: "Medio de pago" }).element();
      expect(methods.textContent).toMatch(/Transferencia.*Terminal independiente/s);
    },
  );

  it("opens the modal to load the result of the second terminal, without charging yet", async () => {
    const { screen, chargeSaleOnStandaloneTerminal } = await renderScreen();

    await chooseStandaloneTerminal(screen);

    await expect.element(screen.getByText("TERMINAL INDEPENDIENTE")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Cargá el resultado de la segunda Point" }))
      .toBeVisible();
    expect(chargeSaleOnStandaloneTerminal).not.toHaveBeenCalled();
  });

  it("returns to the methods from Cambiar de medio without charging", async () => {
    const { screen, chargeSaleOnStandaloneTerminal } = await renderScreen();

    await chooseStandaloneTerminal(screen);
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect
      .element(screen.getByRole("heading", { name: "Cargá el resultado de la segunda Point" }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("radio", { name: "Terminal independiente" }))
      .toBeVisible();
    expect(chargeSaleOnStandaloneTerminal).not.toHaveBeenCalled();
  });

  it("charges the pending balance unless the cashier lowers the amount", async () => {
    const { screen, chargeSaleOnStandaloneTerminal } = await renderScreen({
      currentSale: async () => SALE_WITH_PART_PAID,
    });

    await chooseStandaloneTerminal(screen);
    await userEvent.click(screen.getByRole("button", { name: REGISTER }));

    expect(chargeSaleOnStandaloneTerminal).toHaveBeenCalledExactlyOnceWith("sale-1", 376_000);
  });

  it("completes the sale and names the standalone terminal when the whole amount is registered", async () => {
    const { screen, chargeSaleOnStandaloneTerminal } = await renderScreen();

    await chooseStandaloneTerminal(screen);
    await userEvent.click(screen.getByRole("button", { name: REGISTER }));

    await expect.element(screen.getByText("VENTA COMPLETADA")).toBeVisible();
    await expect
      .element(screen.getByRole("dialog").getByText("Terminal independiente", { exact: true }))
      .toBeVisible();
    expect(chargeSaleOnStandaloneTerminal).toHaveBeenCalledExactlyOnceWith("sale-1", 476_000);
  });

  it("goes back to the methods, with the balance the core now answers, after a partial amount", async () => {
    const reads = [SALE_OF_ONE_LINE, { ...SALE_OF_ONE_LINE, paid: 200_000, pending: 276_000 }];
    const { screen, chargeSaleOnStandaloneTerminal } = await renderScreen({
      currentSale: async () => reads.shift() ?? SALE_WITH_PART_PAID,
      chargeSaleOnStandaloneTerminal: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 476_000,
        paid: 200_000,
        pending: 276_000,
      }),
    });

    await chooseStandaloneTerminal(screen);
    await userEvent.fill(screen.getByRole("textbox", { name: AMOUNT_FIELD }), "2.000,00");
    await userEvent.click(screen.getByRole("button", { name: REGISTER }));

    await expect
      .element(screen.getByRole("heading", { name: "Cargá el resultado de la segunda Point" }))
      .not.toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "Panel de cobro" });
    await expect.element(panel.getByText("$ 2.000,00")).toBeVisible();
    await expect.element(panel.getByText("$ 2.760,00")).toBeVisible();
    expect(chargeSaleOnStandaloneTerminal).toHaveBeenCalledExactlyOnceWith("sale-1", 200_000);
  });

  it("says the amount cannot exceed the pending balance the core answers", async () => {
    const { screen } = await renderScreen({
      chargeSaleOnStandaloneTerminal: async () => ({ kind: "exceeds_pending", pending: 476_000 }),
    });

    await chooseStandaloneTerminal(screen);
    await userEvent.click(screen.getByRole("button", { name: REGISTER }));

    await expect
      .element(screen.getByText("No puede superar el saldo pendiente de $ 4.760,00."))
      .toBeVisible();
  });

  it("says the amount is invalid when the core refuses it", async () => {
    const { screen } = await renderScreen({
      chargeSaleOnStandaloneTerminal: async () => ({ kind: "invalid_amount" }),
    });

    await chooseStandaloneTerminal(screen);
    await userEvent.click(screen.getByRole("button", { name: REGISTER }));

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "goes back to the sale when the core answers %s",
    async (kind) => {
      const { screen } = await renderScreen({
        chargeSaleOnStandaloneTerminal: async () => ({ kind }),
      });

      await chooseStandaloneTerminal(screen);
      await userEvent.click(screen.getByRole("button", { name: REGISTER }));

      await expect.poll(() => screen.router.state.location.pathname).toBe("/session");
    },
  );

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { screen, onSessionInvalid } = await renderScreen({
        chargeSaleOnStandaloneTerminal: async () => ({ kind }),
      });

      await chooseStandaloneTerminal(screen);
      await userEvent.click(screen.getByRole("button", { name: REGISTER }));

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("says a Mercado Pago charge of the sale is still in progress", async () => {
    const { screen } = await renderScreen({
      chargeSaleOnStandaloneTerminal: async () => ({ kind: "mercado_pago_charge_in_progress" }),
    });

    await chooseStandaloneTerminal(screen);
    await userEvent.click(screen.getByRole("button", { name: REGISTER }));

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Ya hay un cobro con Mercado Pago en curso para esta venta.");
  });

  it("says the sale could not be charged when the core is unavailable", async () => {
    const { screen } = await renderScreen({
      chargeSaleOnStandaloneTerminal: async () => ({ kind: "unavailable" }),
    });

    await chooseStandaloneTerminal(screen);
    await userEvent.click(screen.getByRole("button", { name: REGISTER }));

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
  });
});
