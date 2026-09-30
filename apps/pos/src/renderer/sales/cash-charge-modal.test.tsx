import type { ChargeSaleInCashOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
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

type Charge = (tendered: number) => Promise<ChargeSaleInCashOutcome>;

async function renderModal(charge: Charge = async () => COMPLETED) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const chargeSale = vi.fn(charge);
  const callbacks = {
    onChooseAnotherMethod: vi.fn(),
    onCompleted: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(<CashChargeModal total={TOTAL} charge={chargeSale} {...callbacks} />);
  return {
    screen,
    chargeSale,
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
    await expect.element(screen.getByText("Tiene que cubrir $ 4.760,00.")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("takes the typed amount as soon as it opens", async () => {
    const { field } = await renderModal();

    await userEvent.keyboard("5000");

    await expect.element(field).toHaveValue("5000");
  });

  it("keeps Completar venta disabled, and shows no change, while the amount does not cover the total", async () => {
    const { screen, field, complete } = await renderModal();

    await expect.element(complete).toBeDisabled();
    await userEvent.fill(field, "4.000,00");

    await expect.element(complete).toBeDisabled();
    await expect.element(screen.getByText("VUELTO A ENTREGAR")).not.toBeInTheDocument();
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

  it("shows what the core says is still owed when it refuses the amount as short", async () => {
    const { screen, field, complete } = await renderModal(async () => ({
      kind: "insufficient_cash",
      amount_due: 600_000,
    }));

    await userEvent.fill(field, "5.000,00");
    await userEvent.click(complete);

    await expect.element(screen.getByText("Tiene que cubrir $ 6.000,00.").last()).toBeVisible();
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
