import type { ChargeSaleByTransferOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { TransferChargeModal } from "./transfer-charge-modal";

const TOTAL = 476_000;
const COMPLETED: ChargeSaleByTransferOutcome = {
  kind: "completed",
  sale_id: "sale-1",
  total: TOTAL,
};

const AMOUNT_FIELD = "Importe a cobrar con este medio";
const WHOLE_SALE = { total: TOTAL, paid: 0, pending: TOTAL };

type Charge = (amount: number) => Promise<ChargeSaleByTransferOutcome>;

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
  const screen = await render(<TransferChargeModal {...sale} charge={chargeSale} {...callbacks} />);
  return {
    screen,
    chargeSale,
    callbacks,
    field: screen.getByRole("textbox", { name: AMOUNT_FIELD }),
    seen: screen.getByRole("button", { name: "Vi el ingreso" }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("TransferChargeModal", () => {
  it("waits for the credit and shows what is owed", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("TRANSFERENCIA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Esperando el ingreso en la cuenta" }))
      .toBeVisible();
    await expect.element(screen.getByText("Esperando la acreditación")).not.toBeInTheDocument();
    await expect.element(screen.getByText("Total de la venta")).toBeVisible();
    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("$ 0,00")).toBeVisible();
    await expect.element(screen.getByText("A cobrar ahora")).toBeVisible();
    expect(screen.getByText("$ 4.760,00").elements()).toHaveLength(2);
    await expectNoAccessibilityViolations(screen.container);
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
    const { field, seen, chargeSale } = await renderModal();

    await userEvent.fill(field, "2.000,50");
    await userEvent.click(seen);

    await expect.poll(() => chargeSale.mock.calls).toEqual([[200_050]]);
  });

  it("goes back to the methods when the core registers it as a partial payment", async () => {
    const { field, seen, callbacks } = await renderModal(async () => ({
      kind: "partially_paid",
      sale_id: "sale-1",
      total: TOTAL,
      paid: 200_000,
      pending: 276_000,
    }));

    await userEvent.fill(field, "2.000,00");
    await userEvent.click(seen);

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("says the amount cannot exceed the pending balance the core answers", async () => {
    const { screen, field, seen, callbacks } = await renderModal(
      async () => ({ kind: "exceeds_pending", pending: 376_000 }),
      { total: TOTAL, paid: 100_000, pending: 376_000 },
    );

    await userEvent.fill(field, "5.000,00");
    await userEvent.click(seen);

    await expect
      .element(screen.getByText("No puede superar el saldo pendiente de $ 3.760,00."))
      .toBeVisible();
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("says the amount is invalid when the core refuses it", async () => {
    const { screen, field, seen } = await renderModal(async () => ({ kind: "invalid_amount" }));

    await userEvent.fill(field, "0");
    await userEvent.click(seen);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
  });

  it("does not charge what is not an amount, and says so", async () => {
    const { screen, field, seen, chargeSale } = await renderModal();

    await userEvent.fill(field, "abc");
    await userEvent.click(seen);

    await expect
      .element(screen.getByText("Ingresá un importe válido, por ejemplo 5.000,00."))
      .toBeVisible();
    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("warns not to confirm from the customer's screen", async () => {
    const { screen } = await renderModal();

    await expect
      .element(screen.getByText("No confirmes con la pantalla del cliente"))
      .toBeInTheDocument();
    await expect
      .element(
        screen.getByText(
          "Una captura falsa o una transferencia programada se ven igual que una real. Confirmá solo al ver el ingreso en el dispositivo del mostrador.",
        ),
      )
      .toBeInTheDocument();
  });

  it("charges the sale by transfer once from Vi el ingreso and reports the completed sale", async () => {
    const { seen, chargeSale, callbacks } = await renderModal();

    await userEvent.click(seen);

    await expect
      .poll(() => callbacks.onCompleted.mock.calls)
      .toEqual([[{ ...COMPLETED, amount: TOTAL }]]);
    expect(chargeSale).toHaveBeenCalledExactlyOnceWith(TOTAL);
  });

  it("charges nothing until Vi el ingreso is pressed", async () => {
    const { chargeSale } = await renderModal();

    expect(chargeSale).not.toHaveBeenCalled();
  });

  it("cannot be charged twice while the charge is pending", async () => {
    const pending = deferred<ChargeSaleByTransferOutcome>();
    const { seen, chargeSale } = await renderModal(() => pending.promise);

    await userEvent.click(seen);

    await expect.element(seen).toBeDisabled();
    seen.element().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(chargeSale).toHaveBeenCalledOnce();
    pending.resolve(COMPLETED);
  });

  it("goes back to the payment methods from No llegó without charging", async () => {
    const { screen, chargeSale, callbacks } = await renderModal();

    await userEvent.click(screen.getByRole("button", { name: "No llegó: cambiar de medio" }));

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
    const { seen, callbacks } = await renderModal(async () => outcome);

    await userEvent.click(seen);

    await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it.each([["empty_sale"], ["zero_total"], ["no_open_sale"], ["not_permitted"]] as const)(
    "leaves the charge for the sale screen when the core answers %s",
    async (kind) => {
      const { seen, callbacks } = await renderModal(async () => ({ kind }));

      await userEvent.click(seen);

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
      expect(callbacks.onCompleted).not.toHaveBeenCalled();
    },
  );

  it.each([["not_signed_in"], ["no_open_session"]] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { seen, callbacks } = await renderModal(async () => ({ kind }));

      await userEvent.click(seen);

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("says the sale could not be charged when the core is unavailable, and lets the cashier try again", async () => {
    const answers: ChargeSaleByTransferOutcome[] = [{ kind: "unavailable" }, COMPLETED];
    const { screen, seen, callbacks } = await renderModal(async () => {
      const answer = answers.shift();
      if (answer === undefined) {
        throw new Error("no answer left");
      }
      return answer;
    });

    await userEvent.click(seen);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
    await userEvent.click(seen);

    await expect
      .poll(() => callbacks.onCompleted.mock.calls)
      .toEqual([[{ ...COMPLETED, amount: TOTAL }]]);
  });

  it("treats a failed request as the core being unavailable", async () => {
    const { screen, seen } = await renderModal(() =>
      Promise.reject(new Error("the core connection was replaced")),
    );

    await userEvent.click(seen);

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("No se pudo cobrar la venta. Probá de nuevo.");
  });
});
