import type { ChargeSaleOnStandaloneTerminalOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { StandaloneTerminalChargeModal } from "./standalone-terminal-charge-modal";

const TOTAL = 476_000;
const COMPLETED: ChargeSaleOnStandaloneTerminalOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: TOTAL,
};

const AMOUNT_FIELD = "Importe a cobrar con este medio";
const WHOLE_SALE = { total: TOTAL, paid: 0, pending: TOTAL };

type Charge = (amount: number) => Promise<ChargeSaleOnStandaloneTerminalOutcome>;

async function renderModal(
  charge: Charge = async () => COMPLETED,
  sale: { total: number; paid: number; pending: number } = WHOLE_SALE,
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const chargeSale = vi.fn(charge);
  const callbacks = {
    onChooseAnotherMethod: vi.fn(),
    onCompleted: vi.fn(),
    onPartiallyPaid: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(
    <StandaloneTerminalChargeModal {...sale} charge={chargeSale} {...callbacks} />,
  );
  return {
    screen,
    chargeSale,
    callbacks,
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    register: screen.getByRole("button", { name: "Registrar pago aprobado" }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("StandaloneTerminalChargeModal", () => {
  it("asks for the result of the second terminal and shows what is owed", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("TERMINAL INDEPENDIENTE")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Cargá el resultado de la segunda Point" }))
      .toBeVisible();
    await expect.element(screen.getByText("Total de la venta")).toBeVisible();
    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("$ 0,00")).toBeVisible();
    await expect.element(screen.getByText("A cobrar ahora")).toBeVisible();
    expect(screen.getByText("$ 4.760,00").elements()).toHaveLength(2);
    await expectNoAccessibilityViolations(screen.container);
  });

  it("tells the cashier to charge on the second terminal and enter what it shows, before the amount", async () => {
    const { screen, field } = await renderModal();
    const text =
      "Cobrá en la segunda Point, que funciona sin la caja, y cargá acá lo que muestra la terminal.";
    const instruction = screen.getByText(text).first();

    await expect.element(instruction).toBeVisible();
    await expect.element(screen.getByRole("status")).toHaveTextContent(text);
    expect(
      instruction.element().compareDocumentPosition(field.element()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("asks for the amount to charge with this method, filled with the whole pending balance", async () => {
    const { field } = await renderModal();

    await expect.element(field).toHaveValue("4.760,00");
  });

  it("fills the amount with the pending balance, and shows what is paid and what is to be charged now, when part of the sale is already paid", async () => {
    const { screen, field } = await renderModal(undefined, {
      total: TOTAL,
      paid: 100_000,
      pending: 376_000,
    });

    await expect.element(field).toHaveValue("3.760,00");
    await expect.element(screen.getByText("$ 1.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 3.760,00").first()).toBeVisible();
  });

  it("charges the amount the cashier typed", async () => {
    const { field, register, chargeSale } = await renderModal();

    await userEvent.fill(field, "2.000,50");
    await userEvent.click(register);

    await expect.poll(() => chargeSale.mock.calls).toEqual([[200_050]]);
  });

  it("goes back to the methods when the core registers it as a partial payment", async () => {
    const { field, register, callbacks } = await renderModal(async () => ({
      kind: "partially_paid",
      sale_id: "sale-1",
      total: TOTAL,
      paid: 200_000,
      pending: 276_000,
    }));

    await userEvent.fill(field, "2.000,00");
    await userEvent.click(register);

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("stays charging until the screen has gone back to the methods with the new balance", async () => {
    const backToMethods = deferred<void>();
    const { field, register, chargeSale, callbacks } = await renderModal(async () => ({
      kind: "partially_paid",
      sale_id: "sale-1",
      total: TOTAL,
      paid: 200_000,
      pending: 276_000,
    }));
    callbacks.onPartiallyPaid.mockReturnValue(backToMethods.promise);

    await userEvent.fill(field, "2.000,00");
    await userEvent.click(register);

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    await expect.element(register).toBeDisabled();
    backToMethods.resolve();
    await expect.element(register).toBeEnabled();
    expect(chargeSale).toHaveBeenCalledOnce();
  });

  it("says the amount cannot exceed the pending balance the core answers", async () => {
    const { screen, field, register, callbacks } = await renderModal(
      async () => ({ kind: "exceeds_pending", pending: 376_000 }),
      { total: TOTAL, paid: 100_000, pending: 376_000 },
    );

    await userEvent.fill(field, "5.000,00");
    await userEvent.click(register);

    await expect
      .element(screen.getByText("No puede superar el saldo pendiente de $ 3.760,00."))
      .toBeVisible();
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("says the amount is invalid when the core refuses it", async () => {
    const { screen, field, register } = await renderModal(async () => ({ kind: "invalid_amount" }));

    await userEvent.fill(field, "0");
    await userEvent.click(register);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
  });

  it("does not charge what is not an amount, and says so", async () => {
    const { screen, field, register, chargeSale } = await renderModal();

    await userEvent.fill(field, "abc");
    await userEvent.click(register);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("shows no error before charging", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });

  it("says up to which amount can be charged and that the rest stays pending", async () => {
    const { screen } = await renderModal();

    await expect
      .element(
        screen.getByText(
          "Hasta el saldo pendiente, $ 4.760,00. Si cobrás menos, el resto queda pendiente para otro medio.",
        ),
      )
      .toBeVisible();
  });

  it("does not warn about the customer's screen", async () => {
    const { screen } = await renderModal();

    await expect
      .element(screen.getByText("No confirmes con la pantalla del cliente"))
      .not.toBeInTheDocument();
  });

  it("charges the sale on the standalone terminal once from Registrar pago aprobado and reports the completed sale", async () => {
    const { register, chargeSale, callbacks } = await renderModal();

    await userEvent.click(register);

    await expect
      .poll(() => callbacks.onCompleted.mock.calls)
      .toEqual([[{ ...COMPLETED, amount: TOTAL }]]);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(TOTAL);
  });

  it("charges nothing until Registrar pago aprobado is pressed", async () => {
    const { chargeSale } = await renderModal();

    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("cannot be charged twice while the charge is pending", async () => {
    const pending = deferred<ChargeSaleOnStandaloneTerminalOutcome>();
    const { register, chargeSale } = await renderModal(() => pending.promise);

    await userEvent.click(register);

    await expect.element(register).toBeDisabled();
    register.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(chargeSale).toHaveBeenCalledOnce();
    pending.resolve(COMPLETED);
  });

  it("goes back to the payment methods from Cambiar de medio without charging", async () => {
    const { screen, chargeSale, callbacks } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("goes back to the payment methods when it is closed without charging", async () => {
    const { chargeSale, callbacks } = await renderModal();

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
    expect(chargeSale).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const)("leaves the charge for the sale screen when the core answers %j", async (outcome) => {
    const { register, callbacks } = await renderModal(async () => outcome);

    await userEvent.click(register);

    await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "leaves the charge for the sale screen when the core answers %s",
    async (kind) => {
      const { register, callbacks } = await renderModal(async () => ({ kind }));

      await userEvent.click(register);

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
      expect(callbacks.onCompleted).not.toHaveBeenCalled();
    },
  );

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { register, callbacks } = await renderModal(async () => ({ kind }));

      await userEvent.click(register);

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("says the sale could not be charged when the core is unavailable, and lets the cashier try again", async () => {
    const answers: ChargeSaleOnStandaloneTerminalOutcome[] = [{ kind: "unavailable" }, COMPLETED];
    const { screen, register, callbacks } = await renderModal(async () => {
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
    const { screen, register, callbacks } = await renderModal(async () => ({
      kind: "mercado_pago_charge_in_progress",
    }));

    await userEvent.click(register);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Ya hay un cobro con Mercado Pago en curso para esta venta.");
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("treats a failed request as the core being unavailable", async () => {
    const { screen, register } = await renderModal(() =>
      Promise.reject(new Error("the core connection was replaced")),
    );

    await userEvent.click(register);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
  });
});
