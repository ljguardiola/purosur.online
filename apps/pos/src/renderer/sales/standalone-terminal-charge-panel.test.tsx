import type { ChargeSaleOnStandaloneTerminalOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { StandaloneTerminalChargePanel } from "./standalone-terminal-charge-panel";

const TOTAL = 476_000;
const COMPLETED: ChargeSaleOnStandaloneTerminalOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: TOTAL,
};

const AMOUNT_FIELD = "IMPORTE";

type Charge = (amount: number) => Promise<ChargeSaleOnStandaloneTerminalOutcome>;

async function renderPanel(charge: Charge = async () => COMPLETED, pending: number = TOTAL) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const chargeSale = vi.fn(charge);
  const callbacks = {
    onBack: vi.fn(),
    onCompleted: vi.fn(),
    onPartiallyPaid: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(
    <StandaloneTerminalChargePanel pending={pending} charge={chargeSale} {...callbacks} />,
  );
  return {
    screen,
    chargeSale,
    callbacks,
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    register: screen.getByRole("button", { name: "Registrar pago" }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("StandaloneTerminalChargePanel", () => {
  it("shows what is to be charged, the terminal title and its keys", async () => {
    const { screen } = await renderPanel();

    await expect
      .element(screen.getByRole("heading", { name: "Terminal independiente" }))
      .toBeVisible();
    await expect.element(screen.getByText("A COBRAR")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Registrar pago" })).toBeVisible();
    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(expect.arrayContaining(["Esc", "Enter"]));
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows no summary, instruction, field description or remainder, and no way to change the method", async () => {
    const { screen, field } = await renderPanel();

    await userEvent.fill(field, "1000,00");

    await expect.element(screen.getByText("A cobrar ahora")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
    await expect.element(screen.getByText(/Hasta el saldo pendiente/)).not.toBeInTheDocument();
    await expect.element(screen.getByText("QUEDA")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Cambiar de medio" }))
      .not.toBeInTheDocument();
  });

  it("has the amount focused as soon as it opens", async () => {
    const { field } = await renderPanel();

    await expect.element(field).toHaveFocus();
  });

  it("registers the payment with Enter, for the amount shown", async () => {
    const { chargeSale, callbacks } = await renderPanel();

    await userEvent.keyboard("{Enter}");

    await expect
      .poll(() => callbacks.onCompleted.mock.calls)
      .toEqual([[{ ...COMPLETED, amount: TOTAL }]]);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(TOTAL);
  });

  it("goes back with Esc and from its close button without charging", async () => {
    const { screen, chargeSale, callbacks } = await renderPanel();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));

    await expect.poll(() => callbacks.onBack.mock.calls.length).toBe(2);
    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("asks for the amount to charge with this method, filled with the whole pending balance", async () => {
    const { field } = await renderPanel();

    await expect.element(field).toHaveValue("4.760,00");
    await expect.element(field).toHaveAttribute("inputmode", "decimal");
  });

  it("charges the amount the cashier typed", async () => {
    const { field, register, chargeSale } = await renderPanel();

    await userEvent.fill(field, "2000,50");
    await userEvent.click(register);

    await expect.poll(() => chargeSale.mock.calls).toEqual([[200_050]]);
  });

  it("goes back to the methods when the core registers it as a partial payment", async () => {
    const { field, register, callbacks } = await renderPanel(async () => ({
      kind: "partially_paid",
      sale_id: "sale-1",
      total: TOTAL,
      paid: 200_000,
      pending: 276_000,
    }));

    await userEvent.fill(field, "2000,00");
    await userEvent.click(register);

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("stays charging until the screen has gone back to the methods with the new balance", async () => {
    const backToMethods = deferred<void>();
    const { field, register, chargeSale, callbacks } = await renderPanel(async () => ({
      kind: "partially_paid",
      sale_id: "sale-1",
      total: TOTAL,
      paid: 200_000,
      pending: 276_000,
    }));
    callbacks.onPartiallyPaid.mockReturnValue(backToMethods.promise);

    await userEvent.fill(field, "2000,00");
    await userEvent.click(register);

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    await expect.element(register).toBeDisabled();
    backToMethods.resolve();
    await expect.element(register).toBeEnabled();
    expect(chargeSale).toHaveBeenCalledOnce();
  });

  it("says the amount cannot exceed the pending balance the core answers", async () => {
    const { screen, field, register, callbacks } = await renderPanel(
      async () => ({ kind: "exceeds_pending", pending: 376_000 }),
      376_000,
    );

    await userEvent.fill(field, "5000,00");
    await userEvent.click(register);

    await expect
      .element(screen.getByText("No puede superar el saldo pendiente de $ 3.760,00."))
      .toBeVisible();
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("says the amount is invalid when the core refuses it", async () => {
    const { screen, field, register } = await renderPanel(async () => ({ kind: "invalid_amount" }));

    await userEvent.fill(field, "0");
    await userEvent.click(register);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
  });

  it("does not charge what is not an amount, and says so", async () => {
    const { screen, field, register, chargeSale } = await renderPanel();

    await userEvent.clear(field);
    await userEvent.keyboard("5,");
    await userEvent.click(register);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("shows no error before charging", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  it("charges the sale on the standalone terminal once from Registrar pago and reports the completed sale", async () => {
    const { register, chargeSale, callbacks } = await renderPanel();

    await userEvent.click(register);

    await expect
      .poll(() => callbacks.onCompleted.mock.calls)
      .toEqual([[{ ...COMPLETED, amount: TOTAL }]]);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(TOTAL);
  });

  it("charges nothing until Registrar pago is pressed", async () => {
    const { chargeSale } = await renderPanel();

    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("cannot be charged twice while the charge is pending", async () => {
    const pending = deferred<ChargeSaleOnStandaloneTerminalOutcome>();
    const { register, chargeSale } = await renderPanel(() => pending.promise);

    await userEvent.click(register);

    await expect.element(register).toBeDisabled();
    register.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(chargeSale).toHaveBeenCalledOnce();
    pending.resolve(COMPLETED);
  });

  it.each([
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const)("leaves the charge for the sale screen when the core answers %j", async (outcome) => {
    const { register, callbacks } = await renderPanel(async () => outcome);

    await userEvent.click(register);

    await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "leaves the charge for the sale screen when the core answers %s",
    async (kind) => {
      const { register, callbacks } = await renderPanel(async () => ({ kind }));

      await userEvent.click(register);

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
      expect(callbacks.onCompleted).not.toHaveBeenCalled();
    },
  );

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { register, callbacks } = await renderPanel(async () => ({ kind }));

      await userEvent.click(register);

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("says the sale could not be charged when the core is unavailable, and lets the cashier try again", async () => {
    const answers: ChargeSaleOnStandaloneTerminalOutcome[] = [{ kind: "unavailable" }, COMPLETED];
    const { screen, register, callbacks } = await renderPanel(async () => {
      const answer = answers.shift();
      if (answer === undefined) {
        throw new Error("no answer left");
      }
      return answer;
    });

    await userEvent.click(register);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
    await userEvent.click(register);

    await expect
      .poll(() => callbacks.onCompleted.mock.calls)
      .toEqual([[{ ...COMPLETED, amount: TOTAL }]]);
  });

  it("says a Mercado Pago charge of the sale is still in progress", async () => {
    const { screen, register, callbacks } = await renderPanel(async () => ({
      kind: "mercado_pago_charge_in_progress",
    }));

    await userEvent.click(register);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Ya hay un cobro con Mercado Pago en curso para esta venta.");
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("says the paid order of the sale must be applied first", async () => {
    const { screen, register, callbacks } = await renderPanel(async () => ({
      kind: "paid_order_not_applied",
    }));

    await userEvent.click(register);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Aplicá primero el pago de Mercado Pago de esta venta.");
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("treats a failed request as the core being unavailable", async () => {
    const { screen, register } = await renderPanel(() =>
      Promise.reject(new Error("the core connection was replaced")),
    );

    await userEvent.click(register);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
  });

  it("groups thousands and takes a typed dot as the decimal comma", async () => {
    const { field } = await renderPanel();
    await userEvent.clear(field);
    await userEvent.type(field, "1234.5");

    await expect.element(field).toHaveValue("1.234,5");
  });
});
