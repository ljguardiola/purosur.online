import type { CashChargeAnswer, ChargeSaleInCashOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { CashChargeModal } from "./cash-charge-modal";

const TOTAL = 476_000;
const AMOUNT_FIELD = "Importe entregado por el cliente";
const COMPLETED: ChargeSaleInCashOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: TOTAL,
  tendered: 500_000,
  change: 24_000,
};

const INVALID_AMOUNT: CashChargeAnswer = { kind: "invalid_amount" };
const CORE_ANSWERS = new Map<number, CashChargeAnswer>([
  [0, INVALID_AMOUNT],
  [3_000_000_000, INVALID_AMOUNT],
  [400_000, { kind: "partial", applied: 400_000, pending: 76_000 }],
  [476_000, { kind: "covered", applied: TOTAL, change: 0 }],
  [500_000, { kind: "covered", applied: TOTAL, change: 24_000 }],
  [500_005, { kind: "covered", applied: TOTAL, change: 24_005 }],
]);

type Charge = (tendered: number) => Promise<ChargeSaleInCashOutcome>;
type ReadCharge = (tendered: number) => Promise<CashChargeAnswer>;

async function answerLikeTheCore(tendered: number): Promise<CashChargeAnswer> {
  const answer = CORE_ANSWERS.get(tendered);
  if (answer === undefined) {
    throw new Error(`test setup: the core has no answer for ${tendered}`);
  }
  return answer;
}

const WHOLE_SALE = { total: TOTAL, paid: 0, pending: TOTAL };

async function renderModal(
  charge: Charge = async () => COMPLETED,
  readCharge: ReadCharge = answerLikeTheCore,
  sale: { total: number; paid: number; pending: number } = WHOLE_SALE,
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const chargeSale = vi.fn(charge);
  const readCashCharge = vi.fn(readCharge);
  const callbacks = {
    onChooseAnotherMethod: vi.fn(),
    onCompleted: vi.fn(),
    onPartiallyPaid: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(
    <CashChargeModal
      saleId="sale-1"
      {...sale}
      readCharge={readCashCharge}
      charge={chargeSale}
      {...callbacks}
    />,
  );
  return {
    screen,
    chargeSale,
    readCashCharge,
    callbacks,
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    complete: screen.getByRole("button", { name: "Completar venta" }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("CashChargeModal", () => {
  it("asks for the amount handed over and shows what is owed", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("COBRO EN EFECTIVO")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Ingresá el importe entregado" }))
      .toBeVisible();
    await expect.element(screen.getByText("Total de la venta")).toBeVisible();
    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("$ 0,00")).toBeVisible();
    await expect.element(screen.getByText("A cobrar ahora")).toBeVisible();
    await expect
      .element(screen.getByText("Con menos de lo que falta, el resto queda pendiente."))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("takes the typed amount as soon as it opens", async () => {
    const { field } = await renderModal();

    await userEvent.keyboard("5000");

    await expect.element(field).toHaveValue("5000");
  });

  it("shows what has been paid and what is to be charged now when part of the sale is already paid", async () => {
    const { screen } = await renderModal(undefined, undefined, {
      total: TOTAL,
      paid: 100_000,
      pending: 376_000,
    });

    await expect.element(screen.getByText("Total de la venta")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("$ 1.000,00")).toBeVisible();
    await expect.element(screen.getByText("A cobrar ahora")).toBeVisible();
    await expect.element(screen.getByText("$ 3.760,00")).toBeVisible();
  });

  it("keeps Completar venta disabled until the core has answered for the amount", async () => {
    const { complete } = await renderModal();

    await expect.element(complete).toBeDisabled();
  });

  it("offers to register a partial payment, and shows what stays pending and no change, while the amount does not cover the pending balance", async () => {
    const { screen, field } = await renderModal();

    await userEvent.fill(field, "4.000,00");

    await expect
      .element(screen.getByRole("button", { name: "Registrar pago parcial" }))
      .toBeEnabled();
    await expect
      .element(screen.getByRole("button", { name: "Completar venta" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("QUEDA PENDIENTE")).toBeVisible();
    await expect.element(screen.getByText("$ 4.760,00 − $ 4.000,00")).toBeVisible();
    await expect.element(screen.getByText("$ 760,00")).toBeVisible();
    await expect.element(screen.getByText("VUELTO A ENTREGAR")).not.toBeInTheDocument();
  });

  it("goes back to the methods when the partial payment is registered", async () => {
    const outcome: ChargeSaleInCashOutcome = {
      kind: "partially_paid",
      sale_id: "sale-1",
      total: TOTAL,
      paid: 400_000,
      pending: 76_000,
    };
    const { screen, field, chargeSale, callbacks } = await renderModal(async () => outcome);

    await userEvent.fill(field, "4.000,00");
    await userEvent.click(screen.getByRole("button", { name: "Registrar pago parcial" }));

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(400_000);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("stays charging until the screen has gone back to the methods with the new balance", async () => {
    const backToMethods = deferred<void>();
    const { screen, field, chargeSale, callbacks } = await renderModal(async () => ({
      kind: "partially_paid",
      sale_id: "sale-1",
      total: TOTAL,
      paid: 400_000,
      pending: 76_000,
    }));
    callbacks.onPartiallyPaid.mockReturnValue(backToMethods.promise);

    await userEvent.fill(field, "4.000,00");
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
    const { screen, field, complete } = await renderModal();

    await userEvent.fill(field, "5.000,00");

    await expect.element(complete).toBeEnabled();
    await expect.element(screen.getByText("VUELTO A ENTREGAR")).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00 − $ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
  });

  it("shows a change of zero when the amount is exactly the total", async () => {
    const { screen, field, complete } = await renderModal();

    await userEvent.fill(field, "4.760,00");

    await expect.element(complete).toBeEnabled();
    await expect.element(screen.getByText("$ 4.760,00 − $ 4.760,00")).toBeVisible();
    await expect.element(screen.getByText("$ 0,00").last()).toBeVisible();
  });

  it("says when what was typed is not an amount", async () => {
    const { screen, field, complete } = await renderModal();

    await userEvent.fill(field, "5.000,001");

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    await expect.element(complete).toBeDisabled();
  });

  it.each([["0"], ["30.000.000,00"]])(
    "says %s is not an amount it can charge, and shows no change",
    async (typed) => {
      const { screen, field, complete } = await renderModal();

      await userEvent.fill(field, typed);

      await expect
        .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
        .toBeVisible();
      await expect.element(complete).toBeDisabled();
      await expect.element(screen.getByText("VUELTO A ENTREGAR")).not.toBeInTheDocument();
    },
  );

  it("asks the core about the exact cents typed", async () => {
    const { field, readCashCharge, screen } = await renderModal();

    await userEvent.fill(field, "5.000,05");

    await expect.element(screen.getByText("VUELTO A ENTREGAR")).toBeVisible();
    expect(readCashCharge).toHaveBeenCalledExactlyOnceWith(500_005);
  });

  it("does not ask the core while nothing, or something that is not an amount, is typed", async () => {
    const { field, readCashCharge, screen } = await renderModal();

    await userEvent.fill(field, "5.000,001");

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    expect(readCashCharge).not.toHaveBeenCalled();
  });

  it("keeps Completar venta disabled and shows the change loading until the core answers", async () => {
    const answer = deferred<CashChargeAnswer>();
    const { screen, field, complete } = await renderModal(undefined, () => answer.promise);

    await userEvent.fill(field, "5.000,00");

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(complete).toBeDisabled();
    await expect.element(screen.getByText("VUELTO A ENTREGAR")).not.toBeInTheDocument();
    answer.resolve({ kind: "covered", applied: TOTAL, change: 24_000 });
    await expect.element(complete).toBeEnabled();
    await expect.element(screen.getByText("Cargando…")).not.toBeInTheDocument();
  });

  it("shows nothing loading while nothing is typed", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("Cargando…")).not.toBeInTheDocument();
  });

  it("shows the change loading again after Reintentar, until the core answers", async () => {
    const retried = deferred<CashChargeAnswer>();
    const answers = [
      () => Promise.reject(new Error("the core connection was replaced")),
      () => retried.promise,
    ];
    const { screen, field } = await renderModal(undefined, () => {
      const next = answers.shift();
      if (next === undefined) {
        throw new Error("no answer left");
      }
      return next();
    });
    await userEvent.fill(field, "5.000,00");
    await expect.element(screen.getByText("No se pudo calcular el vuelto")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    await expect.element(screen.getByText("No se pudo calcular el vuelto")).not.toBeInTheDocument();
    retried.resolve({ kind: "covered", applied: TOTAL, change: 24_000 });
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();
  });

  it("never shows the change worked out for an earlier total of the sale as current", async () => {
    const answers: (CashChargeAnswer | Error)[] = [
      { kind: "covered", applied: TOTAL, change: 24_000 },
      new Error("the core connection was replaced"),
    ];
    const readCharge = async () => {
      const answer = answers.shift();
      if (answer === undefined || answer instanceof Error) {
        throw answer ?? new Error("no answer left");
      }
      return answer;
    };
    const { screen, field, complete, chargeSale, callbacks } = await renderModal(
      undefined,
      readCharge,
    );
    await userEvent.fill(field, "5.000,00");
    await expect.element(screen.getByText("$ 240,00")).toBeVisible();

    await screen.rerender(
      <CashChargeModal
        saleId="sale-1"
        total={490_000}
        paid={0}
        pending={490_000}
        readCharge={readCharge}
        charge={chargeSale}
        {...callbacks}
      />,
    );

    await expect.element(screen.getByText("No se pudo calcular el vuelto")).toBeVisible();
    await expect.element(screen.getByText("$ 240,00")).not.toBeInTheDocument();
    await expect.element(complete).toBeDisabled();
  });

  it("says the change could not be worked out when the core cannot answer, and asks again on retry", async () => {
    const answers: (CashChargeAnswer | Error)[] = [
      new Error("the core connection was replaced"),
      { kind: "covered", applied: TOTAL, change: 24_000 },
    ];
    const { screen, field, complete } = await renderModal(undefined, async () => {
      const answer = answers.shift();
      if (answer === undefined || answer instanceof Error) {
        throw answer ?? new Error("no answer left");
      }
      return answer;
    });

    await userEvent.fill(field, "5.000,00");

    await expect.element(screen.getByText("No se pudo calcular el vuelto")).toBeVisible();
    await expect.element(complete).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await expect.element(complete).toBeEnabled();
  });

  it.each([[null], ["not_permitted"]] as const)(
    "leaves the charge for the sale screen when the core answers %s for the amount",
    async (answer) => {
      const { field, callbacks } = await renderModal(undefined, async () => answer);

      await userEvent.fill(field, "5.000,00");

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBeGreaterThan(0);
    },
  );

  it("charges the exact cents typed and reports the completed sale", async () => {
    const { field, complete, chargeSale, callbacks } = await renderModal();

    await userEvent.fill(field, "5.000,05");
    await userEvent.click(complete);

    await expect.poll(() => callbacks.onCompleted.mock.calls).toEqual([[COMPLETED]]);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(500_005);
  });

  it("does not charge when Enter is pressed in the field, as a scanned barcode ends with one", async () => {
    const { field, complete, chargeSale } = await renderModal();

    await userEvent.fill(field, "5.000,00");
    await userEvent.keyboard("{Enter}");
    await userEvent.click(complete);

    await expect.poll(() => chargeSale.mock.calls).toEqual([[500_000]]);
  });

  it("cannot be charged twice while the charge is pending", async () => {
    const pending = deferred<ChargeSaleInCashOutcome>();
    const { field, complete, chargeSale } = await renderModal(() => pending.promise);

    await userEvent.fill(field, "5.000,00");
    await userEvent.click(complete);

    await expect.element(complete).toBeDisabled();
    complete.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(chargeSale).toHaveBeenCalledOnce();
    pending.resolve(COMPLETED);
  });

  it("goes back to the payment methods from Cambiar de medio", async () => {
    const { screen, callbacks } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
  });

  it("shows the amount as invalid when the core refuses it", async () => {
    const { screen, field, complete } = await renderModal(async () => ({
      kind: "invalid_amount",
    }));

    await userEvent.fill(field, "5.000,00");
    await userEvent.click(complete);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
  });

  it.each([
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const)("leaves the charge for the sale screen when the core answers %j", async (outcome) => {
    const { field, complete, callbacks } = await renderModal(async () => outcome);

    await userEvent.fill(field, "5.000,00");
    await userEvent.click(complete);

    await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "leaves the charge for the sale screen when the core answers %s",
    async (kind) => {
      const { field, complete, callbacks } = await renderModal(async () => ({ kind }));

      await userEvent.fill(field, "5.000,00");
      await userEvent.click(complete);

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
      expect(callbacks.onCompleted).not.toHaveBeenCalled();
    },
  );

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { field, complete, callbacks } = await renderModal(async () => ({ kind }));

      await userEvent.fill(field, "5.000,00");
      await userEvent.click(complete);

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("says the sale could not be charged when the core is unavailable, and lets the cashier try again", async () => {
    const answers: ChargeSaleInCashOutcome[] = [{ kind: "unavailable" }, COMPLETED];
    const { screen, field, complete, callbacks } = await renderModal(async () => {
      const answer = answers.shift();
      if (answer === undefined) {
        throw new Error("no answer left");
      }
      return answer;
    });

    await userEvent.fill(field, "5.000,00");
    await userEvent.click(complete);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
    await userEvent.click(complete);

    await expect.poll(() => callbacks.onCompleted.mock.calls.length).toBe(1);
  });

  it("says the sale could not be charged when the request fails", async () => {
    const { screen, field, complete } = await renderModal(async () => {
      throw new Error("the core connection was replaced");
    });

    await userEvent.fill(field, "5.000,00");
    await userEvent.click(complete);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
    await expect.element(complete).toBeEnabled();
  });
});
