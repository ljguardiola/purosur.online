import type { ChargeSaleByTransferOutcome, NonCashChargeAnswer } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { TransferChargePanel } from "./transfer-charge-panel";

const TOTAL = 476_000;
const COMPLETED: ChargeSaleByTransferOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: TOTAL,
};

const AMOUNT_FIELD = "IMPORTE";

type Charge = (amount: number) => Promise<ChargeSaleByTransferOutcome>;
type ReadCharge = (amount: number) => Promise<NonCashChargeAnswer>;

async function answerLikeTheCore(amount: number): Promise<NonCashChargeAnswer> {
  return amount < TOTAL
    ? { kind: "partial", applied: amount, pending: TOTAL - amount }
    : { kind: "covered", applied: TOTAL };
}

async function renderPanel(
  charge: Charge = async () => COMPLETED,
  pending: number = TOTAL,
  readCharge: ReadCharge = answerLikeTheCore,
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const chargeSale = vi.fn(charge);
  const readSaleCharge = vi.fn(readCharge);
  const callbacks = {
    onBack: vi.fn(),
    onCompleted: vi.fn(),
    onPartiallyPaid: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(
    <TransferChargePanel
      saleId="sale-1"
      pending={pending}
      readCharge={readSaleCharge}
      charge={chargeSale}
      {...callbacks}
    />,
  );
  return {
    screen,
    chargeSale,
    readSaleCharge,
    callbacks,
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    register: screen.getByRole("button", { name: "Registrar transferencia" }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("TransferChargePanel", () => {
  it("shows what is to be charged, the transfer title and its keys", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByRole("heading", { name: "Transferencia" })).toBeVisible();
    await expect.element(screen.getByText("A COBRAR")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Registrar transferencia" }))
      .toBeVisible();
    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(expect.arrayContaining(["Esc", "Enter"]));
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows none of the old modal's summary, warning or way to change the method", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByText("A cobrar ahora")).not.toBeInTheDocument();
    await expect
      .element(screen.getByText("No confirmes con la pantalla del cliente"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "No llegó: cambiar de medio" }))
      .not.toBeInTheDocument();
  });

  it("has the amount focused as soon as it opens, so it can be typed over without the mouse", async () => {
    const { field } = await renderPanel();

    await expect.element(field).toHaveFocus();
  });

  it("shows what the core says remains after the typed amount", async () => {
    const { screen, field, readSaleCharge } = await renderPanel(undefined, TOTAL, async () => ({
      kind: "partial",
      applied: 100_000,
      pending: 123_400,
    }));

    await userEvent.fill(field, "1000,00");

    await expect.element(screen.getByText("QUEDA")).toBeVisible();
    await expect.element(screen.getByText("$ 1.234,00")).toBeVisible();
    expect(readSaleCharge).toHaveBeenLastCalledWith(100_000);
  });

  it.each<[string, NonCashChargeAnswer]>([
    ["covers the pending balance", { kind: "covered", applied: 100_000 }],
    ["exceeds the pending balance", { kind: "exceeds_pending", pending: 50_000 }],
    ["is not a valid amount", { kind: "invalid_amount" }],
    ["belongs to no sale in progress", null],
    ["may not be charged by the person signed in", "not_permitted"],
  ])("shows no remainder when the core says the typed amount %s", async (_case, answer) => {
    const { screen, field, readSaleCharge } = await renderPanel(
      undefined,
      TOTAL,
      async () => answer,
    );

    await userEvent.fill(field, "1000,00");

    await expect.poll(() => readSaleCharge.mock.calls).toContainEqual([100_000]);
    await expect.element(screen.getByText("QUEDA")).not.toBeInTheDocument();
  });

  it("shows no remainder while no amount is typed", async () => {
    const { screen, field } = await renderPanel();

    await userEvent.fill(field, "");

    await expect.element(screen.getByText("QUEDA")).not.toBeInTheDocument();
  });

  it("registers the transfer with Enter, for the amount shown", async () => {
    const { chargeSale, callbacks } = await renderPanel();

    await userEvent.keyboard("{Enter}");

    await expect
      .poll(() => callbacks.onCompleted.mock.calls)
      .toEqual([[{ ...COMPLETED, amount: TOTAL }]]);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(TOTAL);
  });

  it("registers the typed partial amount with Enter", async () => {
    const { field, chargeSale } = await renderPanel();

    await userEvent.fill(field, "1000,00");
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => chargeSale.mock.calls).toEqual([[100_000]]);
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

  it("charges the sale by transfer once from Registrar transferencia and reports the completed sale", async () => {
    const { register, chargeSale, callbacks } = await renderPanel();

    await userEvent.click(register);

    await expect
      .poll(() => callbacks.onCompleted.mock.calls)
      .toEqual([[{ ...COMPLETED, amount: TOTAL }]]);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(TOTAL);
  });

  it("charges nothing until Registrar transferencia is pressed", async () => {
    const { chargeSale } = await renderPanel();

    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("cannot be charged twice while the charge is pending", async () => {
    const pending = deferred<ChargeSaleByTransferOutcome>();
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
    const answers: ChargeSaleByTransferOutcome[] = [{ kind: "unavailable" }, COMPLETED];
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
