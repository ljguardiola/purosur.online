import type {
  AbandonMercadoPagoChargeOutcome,
  FollowMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { ShownPointOrder } from "./point-charge-modal";
import { PointPaymentWaitModal } from "./point-payment-wait-modal";

const TOTAL = 5_070_000;
const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000b1";
const ORDER = {
  kind: "order_shown",
  payment_transaction_id: PAYMENT_ID,
  amount: 3_000_000,
  remaining_seconds: 180,
} as const;
const WAITING: FollowMercadoPagoChargeOutcome = { kind: "waiting", remaining_seconds: 161 };
const WAIT_OVER: FollowMercadoPagoChargeOutcome = { kind: "at_terminal_wait_over" };
const CLOSED: FollowMercadoPagoChargeOutcome = { kind: "closed" };
const COMPLETED = { kind: "completed", sale_id: "sale-1", total: TOTAL } as const;
const PARTIALLY_PAID = {
  kind: "partially_paid",
  sale_id: "sale-1",
  total: TOTAL,
  paid: 4_000_000,
  pending: 1_070_000,
} as const;

const NEXT_ASK_TIMEOUT_MS = 5_000;

type Follow = (paymentTransactionId: string) => Promise<FollowMercadoPagoChargeOutcome>;

function answering(...outcomes: FollowMercadoPagoChargeOutcome[]): Follow {
  return async () => (outcomes.length > 1 ? outcomes.shift() : outcomes[0]) ?? WAITING;
}

type Abandon = (paymentTransactionId: string) => Promise<AbandonMercadoPagoChargeOutcome>;

async function renderModal(
  follow: Follow = answering(WAITING),
  abandon: Abandon = async () => ({ kind: "cancelled" }),
  order: ShownPointOrder = ORDER,
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const followCharge = vi.fn(follow);
  const abandonCharge = vi.fn(abandon);
  const callbacks = {
    onChooseAnotherMethod: vi.fn(),
    onCompleted: vi.fn(),
    onPartiallyPaid: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(
    <PointPaymentWaitModal
      total={TOTAL}
      paid={1_000_000}
      order={order}
      follow={followCharge}
      abandon={abandonCharge}
      {...callbacks}
    />,
  );
  return { screen, followCharge, abandonCharge, callbacks };
}

function buttonLabels(screen: Awaited<ReturnType<typeof renderModal>>["screen"]) {
  return screen
    .getByRole("button")
    .elements()
    .map((button) => button.textContent);
}

describe("PointPaymentWaitModal", () => {
  describe("while the customer pays on the terminal", () => {
    it("shows what is owed, the steps, the time left and that the terminal must cancel first", async () => {
      const { screen } = await renderModal();

      await expect.element(screen.getByText("POINT INTEGRADA")).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: "El cliente paga en la terminal" }))
        .toBeVisible();
      await expect.element(screen.getByText("Total de la venta")).toBeVisible();
      await expect.element(screen.getByText("$ 50.700,00")).toBeVisible();
      await expect.element(screen.getByText("Pagado")).toBeVisible();
      await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
      await expect.element(screen.getByText("A cobrar ahora")).toBeVisible();
      await expect.element(screen.getByText("$ 30.000,00")).toBeVisible();
      await expect.element(screen.getByText("Cobro enviado a la terminal")).toBeVisible();
      await expect.element(screen.getByText("Esperando la tarjeta")).toBeVisible();
      await expect.element(screen.getByText("Débito o crédito, en la terminal")).toBeVisible();
      await expect.element(screen.getByText("Pago aprobado")).toBeVisible();
      await expect.element(screen.getByRole("timer", { name: "Tiempo para pagar" })).toBeVisible();
      await expect.element(screen.getByText("2:41")).toBeVisible();
      await expect.element(screen.getByText("de 3:00")).toBeVisible();
      await expect
        .element(screen.getByRole("status"))
        .toHaveTextContent(
          "Para cambiar de medio, cancelá primero en la terminal La caja no puede cancelar un cobro que ya está en la terminal.",
        );
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows the whole wait the order was shown with until the core answers", async () => {
      const { screen } = await renderModal(() => new Promise(() => {}));

      await expect.element(screen.getByText("3:00").first()).toBeVisible();
    });

    it("offers only Cambiar de medio, with no way to close it", async () => {
      const { screen } = await renderModal();

      await expect.element(screen.getByText("2:41")).toBeVisible();
      expect(buttonLabels(screen)).toEqual(["Cambiar de medio"]);
    });

    it("keeps asking the core about the payment every second", async () => {
      const { followCharge } = await renderModal();

      await expect
        .poll(() => followCharge.mock.calls.length, { timeout: NEXT_ASK_TIMEOUT_MS })
        .toBeGreaterThan(1);
      expect(new Set(followCharge.mock.calls.map(([id]) => id))).toEqual(new Set([PAYMENT_ID]));
    });

    it.each([{ kind: "cancelled" }, { kind: "closed" }] as const)(
      "abandons the order from Cambiar de medio and goes back to the methods when it is $kind",
      async (answer) => {
        const { screen, abandonCharge, callbacks } = await renderModal(
          undefined,
          async () => answer,
        );

        await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

        await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
        expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
      },
    );

    it("keeps waiting and says to cancel on the terminal when the register cannot reach the cloud", async () => {
      const { screen, callbacks } = await renderModal(undefined, async () => ({
        kind: "unreachable",
      }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect
        .element(
          screen
            .getByText(
              "No hay conexión con la nube. Cancelá el cobro en la terminal y esperá a que vuelva la conexión.",
            )
            .first(),
        )
        .toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: "El cliente paga en la terminal" }))
        .toBeVisible();
      expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("says the cancellation could not be asked, and lets it be asked again", async () => {
      const answers: Abandon[] = [
        async () => ({ kind: "unavailable" }),
        async () => ({ kind: "cancelled" }),
      ];
      const { screen, callbacks } = await renderModal(undefined, (id) => {
        const next = answers.shift();
        return next === undefined ? Promise.resolve({ kind: "cancelled" as const }) : next(id);
      });

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));
      await expect
        .element(
          screen
            .getByText(
              "No se pudo cancelar el cobro de la terminal. Volvé a intentarlo en unos segundos.",
            )
            .first(),
        )
        .toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
    });

    it("goes back to the methods when the terminal closes the order by itself", async () => {
      const { callbacks } = await renderModal(answering(WAITING, CLOSED));

      await expect
        .poll(() => callbacks.onChooseAnotherMethod.mock.calls.length, {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBe(1);
    });

    it("says the core could not tell how the payment goes and asks again from Reintentar", async () => {
      const { screen, followCharge } = await renderModal(
        answering({ kind: "unavailable" }, WAITING),
      );

      await expect
        .element(screen.getByText("No se pudo consultar el cobro en la terminal"))
        .toBeVisible();
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      await expect.element(screen.getByText("2:41")).toBeVisible();
      expect(followCharge).toHaveBeenCalledTimes(2);
    });
  });

  describe("when the wait is over and the order is still on the terminal", () => {
    it("tells to cancel on the terminal and offers Elegir otro medio only once the terminal closes the order", async () => {
      const { screen, callbacks } = await renderModal(answering(WAIT_OVER, WAIT_OVER, CLOSED));

      await expect
        .element(screen.getByRole("heading", { name: "Se terminó el tiempo de espera" }))
        .toBeVisible();
      await expect.element(screen.getByText("Total de la venta")).toBeVisible();
      await expect.element(screen.getByText("$ 50.700,00")).toBeVisible();
      await expect.element(screen.getByText("Pagado")).toBeVisible();
      await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
      await expect.element(screen.getByText("A cobrar ahora")).toBeVisible();
      await expect.element(screen.getByText("$ 30.000,00")).toBeVisible();
      await expect.element(screen.getByText("0:00")).toBeVisible();
      await expect.element(screen.getByText("de 3:00")).toBeVisible();
      await expect.element(screen.getByText("Cobro enviado a la terminal")).toBeVisible();
      await expect.element(screen.getByText("Tiempo agotado")).toBeVisible();
      await expect.element(screen.getByText("Con error")).toBeInTheDocument();
      await expect.element(screen.getByText("Esperando la cancelación")).toBeVisible();
      await expect
        .element(screen.getByText("Cancelá el cobro en la terminal", { exact: true }).first())
        .toBeVisible();
      await expect
        .element(screen.getByRole("status"))
        .toHaveTextContent(
          "Cancelá el cobro en la terminal Otro medio se habilita recién cuando la terminal confirme la cancelación.",
        );
      await expect
        .element(screen.getByRole("button", { name: "Elegir otro medio" }))
        .toBeDisabled();
      expect(buttonLabels(screen)).toEqual(["Elegir otro medio"]);
      await expectNoAccessibilityViolations(screen.container);

      await expect
        .element(screen.getByRole("button", { name: "Elegir otro medio" }), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeEnabled();
      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    });

    it("keeps asking the core while the order is still on the terminal", async () => {
      const { followCharge } = await renderModal(answering(WAIT_OVER));

      await expect
        .poll(() => followCharge.mock.calls.length, { timeout: NEXT_ASK_TIMEOUT_MS })
        .toBeGreaterThan(1);
    });

    it("shows the customer paid when the payment is approved at the last moment", async () => {
      const { screen } = await renderModal(answering(WAIT_OVER, COMPLETED));

      await expect
        .element(screen.getByRole("heading", { name: "El cliente pagó en la terminal" }), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
    });
  });

  describe("when the cancellation is awaited on the terminal before the wait is over", () => {
    async function renderCancelling(follow: Follow = answering(WAITING)) {
      const rendered = await renderModal(follow, async () => ({ kind: "cancel_on_terminal" }));
      await userEvent.click(rendered.screen.getByRole("button", { name: "Cambiar de medio" }));
      return rendered;
    }

    it("tells to cancel on the terminal while the time keeps counting", async () => {
      const { screen } = await renderCancelling();

      await expect
        .element(screen.getByRole("heading", { name: "Esperando la cancelación en la terminal" }))
        .toBeVisible();
      await expect.element(screen.getByText("Total de la venta")).toBeVisible();
      await expect.element(screen.getByText("$ 50.700,00")).toBeVisible();
      await expect.element(screen.getByText("Pagado")).toBeVisible();
      await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
      await expect.element(screen.getByText("A cobrar ahora")).toBeVisible();
      await expect.element(screen.getByText("$ 30.000,00")).toBeVisible();
      await expect.element(screen.getByText("2:41")).toBeVisible();
      await expect.element(screen.getByText("Cobro enviado a la terminal")).toBeVisible();
      await expect.element(screen.getByText("Esperando la cancelación")).toBeVisible();
      await expect
        .element(screen.getByRole("status"))
        .toHaveTextContent(
          "Cancelá el cobro en la terminal Otro medio se habilita recién cuando la terminal confirme la cancelación.",
        );
      await expect
        .element(screen.getByRole("button", { name: "Elegir otro medio" }))
        .toBeDisabled();
      expect(buttonLabels(screen)).toEqual(["Elegir otro medio"]);
      await expectNoAccessibilityViolations(screen.container);
    });

    it("keeps asking the core, and offers Elegir otro medio once the terminal closes the order", async () => {
      const { screen, callbacks } = await renderCancelling(answering(WAITING, WAITING, CLOSED));

      await expect
        .element(screen.getByRole("button", { name: "Elegir otro medio" }), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeEnabled();
      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    });

    it("shows the customer paid when the payment is approved instead of cancelled", async () => {
      const { screen } = await renderCancelling(answering(WAITING, COMPLETED));

      await expect
        .element(screen.getByRole("heading", { name: "El cliente pagó en la terminal" }), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
    });
  });

  describe("when the customer paid", () => {
    it("shows the amount paid and advances only from Continuar once the payment is approved", async () => {
      const { screen, callbacks } = await renderModal(answering(WAITING, COMPLETED));

      await expect
        .element(screen.getByRole("heading", { name: "El cliente pagó en la terminal" }), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
      await expect.element(screen.getByText("Pagado con la Point")).toBeVisible();
      await expect.element(screen.getByText("$ 30.000,00")).toBeVisible();
      await expect.element(screen.getByText("Falta cobrar")).not.toBeInTheDocument();
      expect(callbacks.onCompleted).not.toHaveBeenCalled();
      expect(buttonLabels(screen)).toEqual(["Continuar"]);
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      expect(callbacks.onCompleted.mock.calls).toEqual([[{ ...COMPLETED, amount: 3_000_000 }]]);
    });

    it("shows what is still to be charged and goes back to the methods from Continuar after a partial payment", async () => {
      const { screen, callbacks } = await renderModal(answering(PARTIALLY_PAID));

      await expect.element(screen.getByText("Falta cobrar")).toBeVisible();
      await expect.element(screen.getByText("$ 10.700,00")).toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
      expect(callbacks.onCompleted).not.toHaveBeenCalled();
    });

    it("shows the customer paid when abandoning finds the order was already paid", async () => {
      const { screen, callbacks } = await renderModal(undefined, async () => ({
        kind: "already_paid",
        settlement: COMPLETED,
      }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));
      await expect
        .element(screen.getByRole("heading", { name: "El cliente pagó en la terminal" }))
        .toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      expect(callbacks.onCompleted.mock.calls).toEqual([[{ ...COMPLETED, amount: 3_000_000 }]]);
    });
  });

  describe("when the terminal declined the payment", () => {
    it("says nothing was charged and goes back to the methods from Elegir otro medio", async () => {
      const { screen, callbacks } = await renderModal(answering({ kind: "declined" }));

      await expect.element(screen.getByText("POINT INTEGRADA")).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: "La terminal rechazó el pago" }))
        .toBeVisible();
      await expect
        .element(screen.getByText("La tarjeta no se aprobó, así que no se cobró nada."))
        .toBeVisible();
      await expect
        .element(
          screen.getByText("Se puede volver a intentar con la Point o cobrar con otro medio."),
        )
        .toBeVisible();
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    });
  });

  describe("when the sale or the session can no longer carry the charge", () => {
    it.each([
      { kind: "empty_sale" },
      { kind: "zero_total" },
      { kind: "no_open_sale" },
      { kind: "not_permitted" },
      { kind: "not_pending" },
      { kind: "no_buyer_identification_threshold" },
      { kind: "reaches_buyer_identification_threshold", threshold: 1_000_000 },
    ] as const)("leaves the charge when following answers $kind", async (outcome) => {
      const { callbacks } = await renderModal(answering(outcome));

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    });

    it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
      "asks to check the session when following answers $kind",
      async (outcome) => {
        const { callbacks } = await renderModal(answering(outcome));

        await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
      },
    );

    it("goes back to the methods when abandoning finds the order is not pending", async () => {
      const { screen, callbacks } = await renderModal(undefined, async () => ({
        kind: "not_pending",
      }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
    });

    it("asks to check the session when abandoning finds it is no longer valid", async () => {
      const { screen, callbacks } = await renderModal(undefined, async () => ({
        kind: "not_signed_in",
      }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    });
  });
});
