import type {
  CashChargeAmounts,
  CashChargeAnswer,
  ChargeSaleInCashOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { amountsOf, renderCashChargePanel, valueBeside } from "./test-support/cash-charge-panel";

const TOTAL = 476_000;
const COMPLETED: ChargeSaleInCashOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: TOTAL,
  tendered: 500_000,
  change: 24_000,
  cash_rounding: 0,
};

const INVALID_AMOUNT: CashChargeAnswer = { kind: "invalid_amount" };
const CORE_ANSWERS = new Map<number, CashChargeAnswer>([
  [0, INVALID_AMOUNT],
  [3_000_000_000, INVALID_AMOUNT],
  [400_000, { kind: "partial", applied: 400_000, pending: 76_000 }],
  [476_000, { kind: "covered", applied: TOTAL, change: 0, cash_rounding: 0 }],
  [500_000, { kind: "covered", applied: TOTAL, change: 24_000, cash_rounding: 0 }],
  [500_005, { kind: "covered", applied: TOTAL, change: 24_005, cash_rounding: 0 }],
]);

type Charge = (tendered: number) => Promise<ChargeSaleInCashOutcome>;
type ReadCharge = (tendered: number) => Promise<CashChargeAnswer>;
type ReadAmounts = (discount?: number) => Promise<CashChargeAmounts | null>;

async function answerLikeTheCore(tendered: number): Promise<CashChargeAnswer> {
  const answer = CORE_ANSWERS.get(tendered);
  if (answer === undefined) {
    throw new Error(`test setup: the core has no answer for ${tendered}`);
  }
  return answer;
}

const WHOLE_SALE = { total: TOTAL, paid: 0, pending: TOTAL };

async function renderPanel(
  charge: Charge = async () => COMPLETED,
  readCharge: ReadCharge = answerLikeTheCore,
  sale: { total: number; paid: number; pending: number } = WHOLE_SALE,
  readAmounts?: ReadAmounts,
) {
  return renderCashChargePanel({
    sale,
    readAmounts: readAmounts ?? (async () => amountsOf(sale.pending)),
    discountOffered: false,
    charge,
    readCharge,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("CashChargePanel", () => {
  it("shows the amount to charge the core answers, big, and the total of the sale", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByText("A COBRAR")).toBeVisible();
    await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 4.760,00");
    expect(valueBeside(screen, "Total")).toBe("$ 4.760,00");
    expect(screen.getByText("Redondeo").query()).toBeNull();
    expect(screen.getByText("Pagado").query()).toBeNull();
  });

  it("is the cash charge: Efectivo, its Esc key and the received amount, focused, with no hint under it", async () => {
    const { screen, field } = await renderPanel();

    await expect.element(screen.getByText("Efectivo", { exact: true })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
    await expect.element(screen.getByText("RECIBIDO")).toBeVisible();
    await expect.element(field).toHaveFocus();
    await expect.element(field).toHaveAttribute("inputmode", "decimal");
    await expect.element(screen.getByText(/el resto queda pendiente/)).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("takes the typed amount as soon as it opens", async () => {
    const { field } = await renderPanel();

    await userEvent.keyboard("5000");

    await expect.element(field).toHaveValue("5.000");
  });

  it("shows what has been paid when part of the sale is already paid, and the amount to charge the core answers", async () => {
    const { screen } = await renderPanel(undefined, undefined, {
      total: TOTAL,
      paid: 100_000,
      pending: 376_000,
    });

    await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 3.760,00");
    expect(valueBeside(screen, "Total")).toBe("$ 4.760,00");
    expect(valueBeside(screen, "Pagado")).toBe("$ 1.000,00");
  });

  it("shows the amount to charge loading until the core answers for the sale", async () => {
    const { screen } = await renderPanel(
      undefined,
      undefined,
      undefined,
      () => new Promise(() => {}),
    );

    await expect.element(screen.getByText("A COBRAR")).toBeVisible();
    expect(screen.container.querySelector("[aria-busy=true]")).not.toBeNull();
  });

  it("says the amounts could not be worked out when the core cannot answer, and asks again on Reintentar", async () => {
    const answers: (CashChargeAmounts | Error)[] = [
      new Error("the core connection was replaced"),
      amountsOf(TOTAL),
    ];
    const { screen } = await renderPanel(undefined, undefined, undefined, async () => {
      const answer = answers.shift();
      if (answer === undefined || answer instanceof Error) {
        throw answer ?? new Error("no answer left");
      }
      return answer;
    });

    await expect.element(screen.getByText("No se pudo calcular el importe a cobrar")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.poll(() => valueBeside(screen, "A COBRAR")).toBe("$ 4.760,00");
  });

  it("shows no amount to charge loading once reading it failed", async () => {
    const { screen } = await renderPanel(undefined, undefined, undefined, async () => {
      throw new Error("the core could not read the amounts of a cash charge");
    });

    await expect.element(screen.getByText("No se pudo calcular el importe a cobrar")).toBeVisible();
    expect(screen.container.querySelector("[aria-busy=true]")).toBeNull();
  });

  it("leaves the charge for the sale screen when the core has no sale to charge", async () => {
    const { callbacks } = await renderPanel(undefined, undefined, undefined, async () => null);

    await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBeGreaterThan(0);
  });

  it("keeps Cobrar disabled until the core has answered for the amount", async () => {
    const { complete } = await renderPanel();

    await expect.element(complete).toBeDisabled();
  });

  it("offers to register a partial payment, and shows what stays pending and no change, while the amount does not cover the pending balance", async () => {
    const { screen, field } = await renderPanel();

    await userEvent.fill(field, "4000,00");

    await expect
      .element(screen.getByRole("button", { name: "Registrar pago parcial" }))
      .toBeEnabled();
    await expect.element(screen.getByRole("button", { name: "Cobrar" })).not.toBeInTheDocument();
    await expect.element(screen.getByText("QUEDA PENDIENTE")).toBeVisible();
    await expect.element(screen.getByText("$ 760,00")).toBeVisible();
    await expect.element(screen.getByText("VUELTO")).not.toBeInTheDocument();
  });

  it("goes back to the methods when the partial payment is registered", async () => {
    const outcome: ChargeSaleInCashOutcome = {
      kind: "partially_paid",
      sale_id: "sale-1",
      total: TOTAL,
      paid: 400_000,
      pending: 76_000,
    };
    const { screen, field, chargeSale, callbacks } = await renderPanel(async () => outcome);

    await userEvent.fill(field, "4000,00");
    await userEvent.click(screen.getByRole("button", { name: "Registrar pago parcial" }));

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(400_000);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("stays charging until the screen has gone back to the methods with the new balance", async () => {
    const backToMethods = deferred<void>();
    const { screen, field, chargeSale, callbacks } = await renderPanel(async () => ({
      kind: "partially_paid",
      sale_id: "sale-1",
      total: TOTAL,
      paid: 400_000,
      pending: 76_000,
    }));
    callbacks.onPartiallyPaid.mockReturnValue(backToMethods.promise);

    await userEvent.fill(field, "4000,00");
    await userEvent.click(screen.getByRole("button", { name: "Registrar pago parcial" }));

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    await expect
      .element(screen.getByRole("button", { name: "Registrar pago parcial" }))
      .toBeDisabled();
    backToMethods.resolve();
    await expect
      .element(screen.getByRole("button", { name: "Registrar pago parcial" }))
      .toBeEnabled();
    expect(chargeSale).toHaveBeenCalledOnce();
  });

  it("shows the change to hand over once the amount covers the total", async () => {
    const { screen, field, complete } = await renderPanel();

    await userEvent.fill(field, "5000,00");

    await expect.element(complete).toBeEnabled();
    await expect.element(screen.getByText("VUELTO")).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
  });

  it("shows a change of zero when the amount is exactly the total", async () => {
    const { screen, field, complete } = await renderPanel();

    await userEvent.fill(field, "4760,00");

    await expect.element(complete).toBeEnabled();
    await expect.element(screen.getByText("$ 0,00").last()).toBeVisible();
  });

  it("says when what was typed is not an amount", async () => {
    const { screen, field, complete } = await renderPanel();

    await userEvent.clear(field);
    await userEvent.keyboard("5,");

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    await expect.element(complete).toBeDisabled();
  });

  it.each([["0"], ["30000000,00"]])(
    "says %s is not an amount it can charge, and shows no change",
    async (typed) => {
      const { screen, field, complete } = await renderPanel();

      await userEvent.fill(field, typed);

      await expect
        .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
        .toBeVisible();
      await expect.element(complete).toBeDisabled();
      await expect.element(screen.getByText("VUELTO")).not.toBeInTheDocument();
    },
  );

  it("asks the core about the exact cents typed", async () => {
    const { field, readCashCharge, screen } = await renderPanel();

    await userEvent.fill(field, "5000,05");

    await expect.element(screen.getByText("VUELTO")).toBeVisible();
    expect(readCashCharge).toHaveBeenCalledExactlyOnceWith(500_005);
  });

  it("does not ask the core while nothing, or something that is not an amount, is typed", async () => {
    const { field, readCashCharge, screen } = await renderPanel();

    await userEvent.clear(field);
    await userEvent.keyboard(",");

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    expect(readCashCharge).not.toHaveBeenCalled();
  });

  it("keeps Cobrar disabled and shows no change until the core answers", async () => {
    const answer = deferred<CashChargeAnswer>();
    const { screen, field, complete } = await renderPanel(undefined, () => answer.promise);

    await userEvent.fill(field, "5000,00");

    await expect.element(complete).toBeDisabled();
    await expect.element(screen.getByText("VUELTO")).not.toBeInTheDocument();
    answer.resolve({ kind: "covered", applied: TOTAL, change: 24_000, cash_rounding: 0 });
    await expect.element(complete).toBeEnabled();
  });

  it("shows the change loading again after Reintentar, until the core answers", async () => {
    const retried = deferred<CashChargeAnswer>();
    const answers = [
      () => Promise.reject(new Error("the core connection was replaced")),
      () => retried.promise,
    ];
    const { screen, field } = await renderPanel(undefined, () => {
      const next = answers.shift();
      if (next === undefined) {
        throw new Error("no answer left");
      }
      return next();
    });
    await userEvent.fill(field, "5000,00");
    await expect.element(screen.getByText("No se pudo calcular el vuelto")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByText("No se pudo calcular el vuelto")).not.toBeInTheDocument();
    retried.resolve({ kind: "covered", applied: TOTAL, change: 24_000, cash_rounding: 0 });
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
  });

  it("never shows the change worked out for an earlier total of the sale as current", async () => {
    const answers: (CashChargeAnswer | Error)[] = [
      { kind: "covered", applied: TOTAL, change: 24_000, cash_rounding: 0 },
      new Error("the core connection was replaced"),
    ];
    const readCharge = async () => {
      const answer = answers.shift();
      if (answer === undefined || answer instanceof Error) {
        throw answer ?? new Error("no answer left");
      }
      return answer;
    };
    const { screen, field, complete, showSale } = await renderPanel(undefined, readCharge);
    await userEvent.fill(field, "5000,00");
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();

    await showSale({ total: 490_000, paid: 0, pending: 490_000 });

    await expect.element(screen.getByText("No se pudo calcular el vuelto")).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).not.toBeInTheDocument();
    await expect.element(complete).toBeDisabled();
  });

  it("says the change could not be worked out when the core cannot answer, and asks again on retry", async () => {
    const answers: (CashChargeAnswer | Error)[] = [
      new Error("the core connection was replaced"),
      { kind: "covered", applied: TOTAL, change: 24_000, cash_rounding: 0 },
    ];
    const { screen, field, complete } = await renderPanel(undefined, async () => {
      const answer = answers.shift();
      if (answer === undefined || answer instanceof Error) {
        throw answer ?? new Error("no answer left");
      }
      return answer;
    });

    await userEvent.fill(field, "5000,00");

    await expect.element(screen.getByText("No se pudo calcular el vuelto")).toBeVisible();
    await expect.element(complete).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await expect.element(complete).toBeEnabled();
  });

  it.each([[null], ["not_permitted"]] as const)(
    "leaves the charge for the sale screen when the core answers %s for the amount",
    async (answer) => {
      const { field, callbacks } = await renderPanel(undefined, async () => answer);

      await userEvent.fill(field, "5000,00");

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBeGreaterThan(0);
    },
  );

  it("charges the exact cents typed and reports the completed sale", async () => {
    const { field, complete, chargeSale, callbacks } = await renderPanel();

    await userEvent.fill(field, "5000,05");
    await userEvent.click(complete);

    await expect.poll(() => callbacks.onCompleted.mock.calls).toEqual([[COMPLETED]]);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(500_005);
  });

  it("charges when Enter is pressed once the amount covers what is to be charged", async () => {
    const { field, complete, chargeSale, callbacks } = await renderPanel();

    await userEvent.fill(field, "5000,00");
    await expect.element(complete).toBeEnabled();
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(500_000);
  });

  it("does not charge on Enter while the amount does not cover and is not a partial payment yet", async () => {
    const { field, chargeSale } = await renderPanel();

    await userEvent.fill(field, "5,");
    await userEvent.keyboard("{Enter}");

    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("cannot be charged twice while the charge is pending", async () => {
    const pending = deferred<ChargeSaleInCashOutcome>();
    const { field, complete, chargeSale } = await renderPanel(() => pending.promise);

    await userEvent.fill(field, "5000,00");
    await userEvent.click(complete);

    await expect.element(complete).toBeDisabled();
    complete.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(chargeSale).toHaveBeenCalledOnce();
    pending.resolve(COMPLETED);
  });

  it("offers no Esc button while the charge is pending", async () => {
    const pending = deferred<ChargeSaleInCashOutcome>();
    const { screen, field, complete } = await renderPanel(() => pending.promise);
    await userEvent.fill(field, "5000,00");

    await userEvent.click(complete);

    await expect.element(complete).toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: "Cerrar con Esc" }))
      .not.toBeInTheDocument();
    pending.resolve(COMPLETED);
  });

  it("goes back from the Esc button and from the Esc key, and from nothing else", async () => {
    const { screen, callbacks } = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar con Esc" }));
    await userEvent.keyboard("{Escape}");

    expect(callbacks.onBack).toHaveBeenCalledTimes(2);
  });

  it("shows the amount as invalid when the core refuses it", async () => {
    const { screen, field, complete } = await renderPanel(async () => ({
      kind: "invalid_amount",
    }));

    await userEvent.fill(field, "5000,00");
    await userEvent.click(complete);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
  });

  it.each([
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const)("leaves the charge for the sale screen when the core answers %j", async (outcome) => {
    const { field, complete, callbacks } = await renderPanel(async () => outcome);

    await userEvent.fill(field, "5000,00");
    await userEvent.click(complete);

    await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "leaves the charge for the sale screen when the core answers %s",
    async (kind) => {
      const { field, complete, callbacks } = await renderPanel(async () => ({ kind }));

      await userEvent.fill(field, "5000,00");
      await userEvent.click(complete);

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
      expect(callbacks.onCompleted).not.toHaveBeenCalled();
    },
  );

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { field, complete, callbacks } = await renderPanel(async () => ({ kind }));

      await userEvent.fill(field, "5000,00");
      await userEvent.click(complete);

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("says the sale could not be charged when the core is unavailable, and lets the cashier try again", async () => {
    const answers: ChargeSaleInCashOutcome[] = [{ kind: "unavailable" }, COMPLETED];
    const { screen, field, complete, callbacks } = await renderPanel(async () => {
      const answer = answers.shift();
      if (answer === undefined) {
        throw new Error("no answer left");
      }
      return answer;
    });

    await userEvent.fill(field, "5000,00");
    await userEvent.click(complete);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
    await userEvent.click(complete);

    await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  });

  it("says a Mercado Pago charge of the sale is still in progress", async () => {
    const { screen, field, complete, callbacks } = await renderPanel(async () => ({
      kind: "mercado_pago_charge_in_progress",
    }));

    await userEvent.fill(field, "5000,00");
    await userEvent.click(complete);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Ya hay un cobro con Mercado Pago en curso para esta venta.");
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("says the paid order of the sale must be applied first", async () => {
    const { screen, field, complete, callbacks } = await renderPanel(async () => ({
      kind: "paid_order_not_applied",
    }));

    await userEvent.fill(field, "5000,00");
    await userEvent.click(complete);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("Aplicá primero el pago de Mercado Pago de esta venta.");
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("says the sale could not be charged when the request fails", async () => {
    const { screen, field, complete } = await renderPanel(async () => {
      throw new Error("the core connection was replaced");
    });

    await userEvent.fill(field, "5000,00");
    await userEvent.click(complete);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
    await expect.element(complete).toBeEnabled();
  });

  it("groups thousands and takes a typed dot as the decimal comma", async () => {
    const { field } = await renderPanel();
    await userEvent.clear(field);
    await userEvent.type(field, "1234.5");

    await expect.element(field).toHaveValue("1.234,5");
  });
});
