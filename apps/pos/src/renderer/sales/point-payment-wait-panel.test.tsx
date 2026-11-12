import type {
  AbandonMercadoPagoChargeOutcome,
  FollowMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { ShownPointOrder } from "./point-charge-panel";
import { PointPaymentWaitPanel } from "./point-payment-wait-panel";

const TOTAL = 5_070_000;
const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000b1";
const ORDER = {
  kind: "order_shown",
  payment_transaction_id: PAYMENT_ID,
  amount: 3_000_000,
  remaining_seconds: 180,
  wait_seconds: 180,
} as const;
const WAITING: FollowMercadoPagoChargeOutcome = { kind: "waiting", remaining_seconds: 161 };
const WAIT_OVER: FollowMercadoPagoChargeOutcome = { kind: "at_terminal_wait_over" };
const CLOSED: FollowMercadoPagoChargeOutcome = { kind: "closed" };
const EXPIRED: FollowMercadoPagoChargeOutcome = { kind: "expired" };
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

async function renderPanel(
  follow: Follow = answering(WAITING),
  abandon: Abandon = async () => ({ kind: "cancelled" }),
  order: ShownPointOrder = ORDER,
  cardType: "DEBIT" | "CREDIT" | null = "DEBIT",
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
    <PointPaymentWaitPanel
      order={order}
      cardType={cardType}
      follow={followCharge}
      abandon={abandonCharge}
      {...callbacks}
    />,
  );
  return { screen, followCharge, abandonCharge, callbacks };
}

function buttonLabels(screen: Awaited<ReturnType<typeof renderPanel>>["screen"]) {
  return screen
    .getByRole("button")
    .elements()
    .map((button) => button.textContent);
}

function keycapOf(button: { element: () => Element }) {
  return button.element().querySelector("kbd")?.textContent;
}

describe("PointPaymentWaitPanel", () => {
  it.each([
    ["CREDIT", "Point crédito"],
    [null, "Point"],
  ] as const)("names a %s card charge as %s", async (cardType, name) => {
    const { screen } = await renderPanel(answering(WAITING), undefined, ORDER, cardType);

    await expect.element(screen.getByText(name, { exact: true })).toBeVisible();
  });

  describe("while the customer pays on the terminal", () => {
    it("shows the amount to charge, the steps and the time left, without asking to cancel on the terminal first", async () => {
      const { screen } = await renderPanel();

      await expect.element(screen.getByRole("heading", { name: "Point débito" })).toBeVisible();
      await expect.element(screen.getByText("A COBRAR")).toBeVisible();
      await expect.element(screen.getByText("$ 30.000,00")).toBeVisible();
      await expect.element(screen.getByText("Total de la venta")).not.toBeInTheDocument();
      await expect.element(screen.getByText("Cobro enviado a la terminal")).toBeVisible();
      await expect.element(screen.getByText("Esperando el pago")).toBeVisible();
      await expect.element(screen.getByText("Tarjeta, en la terminal")).not.toBeInTheDocument();
      await expect.element(screen.getByText("Pago aprobado")).toBeVisible();
      await expect.element(screen.getByRole("timer", { name: "Tiempo para pagar" })).toBeVisible();
      await expect.element(screen.getByText("2:41")).toBeVisible();
      await expect.element(screen.getByText("de 3:00")).toBeVisible();
      expect(screen.getByRole("status").elements()).toHaveLength(0);
      await expectNoAccessibilityViolations(screen.container);
    });

    it("shows the whole wait the order was shown with until the core answers", async () => {
      const { screen } = await renderPanel(() => new Promise(() => {}));

      await expect.element(screen.getByText("3:00").first()).toBeVisible();
    });

    it("shows the whole wait as the total of a charge reopened part way through it", async () => {
      const { screen } = await renderPanel(
        answering({ kind: "waiting", remaining_seconds: 40 }),
        undefined,
        { ...ORDER, remaining_seconds: 40 },
      );

      await expect.element(screen.getByText("0:40")).toBeVisible();
      await expect.element(screen.getByText("de 3:00")).toBeVisible();
    });

    it("offers only Cambiar de medio, in the title beside its Esc key", async () => {
      const { screen } = await renderPanel();

      await expect.element(screen.getByText("2:41")).toBeVisible();
      expect(buttonLabels(screen)).toEqual(["Cambiar de medio"]);
      expect(screen.container.querySelector("kbd")?.textContent).toBe("Esc");
    });

    it("abandons the order with Esc and goes back to the methods", async () => {
      const { screen, abandonCharge, callbacks } = await renderPanel();
      await expect.element(screen.getByText("2:41")).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
      expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
    });

    it("keeps asking the core about the payment every second", async () => {
      const { followCharge } = await renderPanel();

      await expect
        .poll(() => followCharge.mock.calls.length, { timeout: NEXT_ASK_TIMEOUT_MS })
        .toBeGreaterThan(1);
      expect(new Set(followCharge.mock.calls.map(([id]) => id))).toEqual(new Set([PAYMENT_ID]));
    });

    it.each([{ kind: "cancelled" }, { kind: "closed" }, { kind: "replaced" }] as const)(
      "abandons the order from Cambiar de medio and goes back to the methods at once when it is $kind",
      async (answer) => {
        const { screen, abandonCharge, callbacks } = await renderPanel(
          undefined,
          async () => answer,
        );

        await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

        await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
        expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
        expect(
          screen
            .getByRole("heading", { name: "Esperando la cancelación en la terminal" })
            .elements(),
        ).toHaveLength(0);
      },
    );

    it("keeps waiting and says to cancel on the terminal when the register cannot reach the cloud", async () => {
      const { screen, callbacks } = await renderPanel(undefined, async () => ({
        kind: "unreachable",
      }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect
        .element(
          screen.getByText("No hay conexión con la nube. Cancelá el cobro en la terminal.").first(),
        )
        .toBeVisible();
      await expect.element(screen.getByRole("heading", { name: "Point débito" })).toBeVisible();
      expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("says the cancellation could not be asked, and lets it be asked again", async () => {
      const answers: Abandon[] = [
        async () => ({ kind: "unavailable" }),
        async () => ({ kind: "cancelled" }),
      ];
      const { screen, callbacks } = await renderPanel(undefined, (id) => {
        const next = answers.shift();
        return next === undefined ? Promise.resolve({ kind: "cancelled" as const }) : next(id);
      });

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));
      await expect
        .element(
          screen.getByText(
            "No se pudo cancelar el cobro de la terminal. Volvé a intentarlo en unos segundos.",
          ),
        )
        .toBeVisible();
      await expect.element(screen.getByRole("timer")).not.toBeInTheDocument();
      await expect.element(screen.getByText("Esperando el pago")).not.toBeInTheDocument();
      const footer = screen.getByRole("button", { name: "Cambiar de medio" }).last();
      await expect.poll(() => keycapOf(footer)).toBe("Enter");
      await userEvent.keyboard("{Enter}");

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
    });

    it("asks to cancel again with Esc after the cancellation could not be asked", async () => {
      const answers: Abandon[] = [
        async () => ({ kind: "unavailable" }),
        async () => ({ kind: "cancelled" }),
      ];
      const { screen, callbacks } = await renderPanel(undefined, (id) => {
        const next = answers.shift();
        return next === undefined ? Promise.resolve({ kind: "cancelled" as const }) : next(id);
      });

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));
      await expect
        .element(
          screen.getByText(
            "No se pudo cancelar el cobro de la terminal. Volvé a intentarlo en unos segundos.",
          ),
        )
        .toBeVisible();
      await userEvent.keyboard("{Escape}");

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
    });

    it("goes back to the methods when the terminal closes the order by itself", async () => {
      const { callbacks } = await renderPanel(answering(WAITING, CLOSED));

      await expect
        .poll(() => callbacks.onChooseAnotherMethod.mock.calls.length, {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBe(1);
    });

    it("says the core could not tell how the payment goes and asks again from Reintentar with R", async () => {
      const { screen, followCharge } = await renderPanel(
        answering({ kind: "unavailable" }, WAITING),
      );

      await expect
        .element(screen.getByText("No se pudo consultar el cobro en la terminal"))
        .toBeVisible();
      await expect.element(screen.getByText("Volvé a intentarlo en unos segundos.")).toBeVisible();
      await expect
        .element(screen.getByRole("button", { name: "Reintentar" }))
        .toHaveTextContent("R");
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      await expect.element(screen.getByText("2:41")).toBeVisible();
      expect(followCharge).toHaveBeenCalledTimes(2);
    });

    it("asks again with the R key, and abandons the order with Esc while it cannot be followed", async () => {
      const { screen, followCharge, abandonCharge } = await renderPanel(
        answering({ kind: "unavailable" }, WAITING),
      );
      await expect
        .element(screen.getByText("No se pudo consultar el cobro en la terminal"))
        .toBeVisible();

      await userEvent.keyboard("r");

      await expect.element(screen.getByText("2:41")).toBeVisible();
      expect(followCharge).toHaveBeenCalledTimes(2);
      expect(abandonCharge).not.toHaveBeenCalled();
    });

    it("abandons the order with Esc when the payment cannot be followed", async () => {
      const { screen, abandonCharge } = await renderPanel(answering({ kind: "unavailable" }));
      await expect
        .element(screen.getByText("No se pudo consultar el cobro en la terminal"))
        .toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.poll(() => abandonCharge.mock.calls.length).toBe(1);
    });
  });

  describe("when the order may have reached the terminal while the cloud could not be reached", () => {
    const UNCONFIRMED = { ...ORDER, kind: "order_unconfirmed" } as const;

    it("says to cancel on the terminal and wait for the connection, while it keeps following the payment", async () => {
      const { screen, followCharge, callbacks } = await renderPanel(
        undefined,
        undefined,
        UNCONFIRMED,
      );

      await expect
        .element(
          screen.getByText("No hay conexión con la nube. Cancelá el cobro en la terminal.").first(),
        )
        .toBeVisible();
      await expect.element(screen.getByRole("heading", { name: "Point débito" })).toBeVisible();
      await expect
        .poll(() => followCharge.mock.calls.length, { timeout: NEXT_ASK_TIMEOUT_MS })
        .toBeGreaterThan(1);
      expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
      await expectNoAccessibilityViolations(screen.container);
    });
  });

  describe("when the wait is over and the order is still on the terminal", () => {
    it("shows the whole wait as the total of a charge reopened after its wait", async () => {
      const { screen } = await renderPanel(answering(WAIT_OVER), undefined, {
        ...ORDER,
        remaining_seconds: 0,
      });

      await expect.element(screen.getByText("Tiempo de espera agotado")).toBeVisible();
      await expect.element(screen.getByText("de 3:00")).toBeVisible();
    });

    it("tells the order expired and nothing was charged when Mercado Pago then expires it", async () => {
      const { screen, callbacks } = await renderPanel(answering(WAIT_OVER, EXPIRED));

      await expect
        .element(screen.getByText("El cobro venció en la terminal"), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
      await expect.element(screen.getByText("No se cobró nada.")).toBeVisible();
      expect(
        screen.getByText("Cancelá el cobro en la terminal.", { exact: true }).elements(),
      ).toHaveLength(0);
      await expect
        .poll(() => keycapOf(screen.getByRole("button", { name: "Cambiar de medio" })))
        .toBe("Enter");
      expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    });

    it("tells to cancel on the terminal and lets the cashier choose another method at once, waiting for no cancellation", async () => {
      const { screen } = await renderPanel(answering(WAIT_OVER));

      await expect.element(screen.getByText("Tiempo de espera agotado")).toBeVisible();
      await expect.element(screen.getByText("A COBRAR")).toBeVisible();
      await expect.element(screen.getByText("$ 30.000,00")).toBeVisible();
      await expect.element(screen.getByText("0:00")).toBeVisible();
      await expect.element(screen.getByText("de 3:00")).toBeVisible();
      await expect.element(screen.getByText("Cobro enviado a la terminal")).toBeVisible();
      await expect.element(screen.getByText("Tiempo de espera agotado")).toBeVisible();
      await expect.element(screen.getByText("Con error")).toBeInTheDocument();
      expect(screen.getByText("Esperando la cancelación", { exact: true }).elements()).toHaveLength(
        0,
      );
      await expect
        .element(screen.getByText("Cancelá el cobro en la terminal.", { exact: true }).first())
        .toBeVisible();
      await expect
        .element(screen.getByRole("status"))
        .toHaveTextContent("Cancelá el cobro en la terminal.");
      await expect.element(screen.getByRole("button", { name: "Cambiar de medio" })).toBeEnabled();
      await expect
        .poll(() => keycapOf(screen.getByRole("button", { name: "Cambiar de medio" })))
        .toBe("Enter");
      await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("abandons the order with Esc as with Cambiar de medio", async () => {
      const { screen, abandonCharge, callbacks } = await renderPanel(answering(WAIT_OVER));
      await expect.element(screen.getByText("Tiempo de espera agotado")).toBeVisible();

      await userEvent.keyboard("{Escape}");

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
      expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
    });

    it("abandons the order with Enter", async () => {
      const { screen, abandonCharge, callbacks } = await renderPanel(answering(WAIT_OVER));
      await expect.element(screen.getByText("Tiempo de espera agotado")).toBeVisible();

      await userEvent.keyboard("{Enter}");

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
      expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
    });

    it.each([{ kind: "cancelled" }, { kind: "closed" }, { kind: "replaced" }] as const)(
      "abandons the order from Cambiar de medio and goes back to the methods when it is $kind",
      async (answer) => {
        const { screen, abandonCharge, callbacks } = await renderPanel(
          answering(WAIT_OVER),
          async () => answer,
        );
        await expect.element(screen.getByText("Tiempo de espera agotado")).toBeVisible();

        await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

        await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
        expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
      },
    );

    it("holds Cambiar de medio while the cancellation is being asked", async () => {
      let answer: (outcome: AbandonMercadoPagoChargeOutcome) => void = () => undefined;
      const { screen, callbacks } = await renderPanel(
        answering(WAIT_OVER),
        () => new Promise((resolve) => (answer = resolve)),
      );
      await expect.element(screen.getByText("Tiempo de espera agotado")).toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect.element(screen.getByRole("button", { name: "Cambiar de medio" })).toBeDisabled();
      answer({ kind: "cancelled" });
      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
    });

    it("says the cancellation could not be asked, and lets it be asked again", async () => {
      const answers: Abandon[] = [
        async () => ({ kind: "unavailable" }),
        async () => ({ kind: "replaced" }),
      ];
      const { screen, callbacks } = await renderPanel(answering(WAIT_OVER), (id) => {
        const next = answers.shift();
        return next === undefined ? Promise.resolve({ kind: "cancelled" as const }) : next(id);
      });
      await expect.element(screen.getByText("Tiempo de espera agotado")).toBeVisible();

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
      await userEvent.keyboard("{Enter}");

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
    });

    it("says to cancel on the terminal and wait for the connection when the register cannot reach the cloud, staying on the wait", async () => {
      const { screen, callbacks } = await renderPanel(answering(WAIT_OVER), async () => ({
        kind: "unreachable",
      }));
      await expect.element(screen.getByText("Tiempo de espera agotado")).toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect
        .element(
          screen.getByText("No hay conexión con la nube. Cancelá el cobro en la terminal.").first(),
        )
        .toBeVisible();
      expect(
        screen.getByText("Cancelá el cobro en la terminal.", { exact: true }).elements(),
      ).toHaveLength(0);
      expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
    });

    it("goes back to the methods once the core says the order closed", async () => {
      const { callbacks } = await renderPanel(answering(WAIT_OVER, CLOSED));

      await expect
        .poll(() => callbacks.onChooseAnotherMethod.mock.calls.length, {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBe(1);
    });

    it("says the core could not tell how the cancellation goes and keeps following from Reintentar", async () => {
      const { screen, callbacks } = await renderPanel(
        answering(WAIT_OVER, { kind: "unavailable" }, CLOSED),
      );

      await expect
        .element(screen.getByText("No se pudo consultar el cobro en la terminal"), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      await expect
        .poll(() => callbacks.onChooseAnotherMethod.mock.calls.length, {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBe(1);
    });

    it("keeps asking the core while the order is still on the terminal", async () => {
      const { followCharge } = await renderPanel(answering(WAIT_OVER));

      await expect
        .poll(() => followCharge.mock.calls.length, { timeout: NEXT_ASK_TIMEOUT_MS })
        .toBeGreaterThan(1);
    });

    it("shows the customer paid when the payment is approved at the last moment", async () => {
      const { screen } = await renderPanel(answering(WAIT_OVER, COMPLETED));

      await expect
        .element(screen.getByRole("heading", { name: "El cliente pagó en la terminal" }), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
    });
  });

  describe("when the customer paid", () => {
    it("shows the amount paid and advances only from Continuar once the payment is approved", async () => {
      const { screen, callbacks } = await renderPanel(answering(WAITING, COMPLETED));

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
      const { screen, callbacks } = await renderPanel(answering(PARTIALLY_PAID));

      await expect.element(screen.getByText("Falta cobrar")).toBeVisible();
      await expect.element(screen.getByText("$ 10.700,00")).toBeVisible();

      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
      expect(callbacks.onCompleted).not.toHaveBeenCalled();
    });

    it("shows the customer paid when abandoning finds the order was already paid", async () => {
      const { screen, callbacks } = await renderPanel(undefined, async () => ({
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

  describe("when Mercado Pago expired the order", () => {
    it("tells nothing was charged and goes back to the methods only from Cambiar de medio", async () => {
      const { screen, callbacks } = await renderPanel(answering(WAITING, EXPIRED));

      await expect
        .element(screen.getByText("El cobro venció en la terminal"), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
      await expect.element(screen.getByRole("heading", { name: "Point débito" })).toBeVisible();
      await expect.element(screen.getByText("No se cobró nada.")).toBeVisible();
      await expect.element(screen.getByText("Se puede volver a intentar")).not.toBeInTheDocument();
      await expect
        .poll(() => keycapOf(screen.getByRole("button", { name: "Cambiar de medio" })))
        .toBe("Enter");
      expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    });
  });

  describe("when the terminal declined the payment", () => {
    it("says nothing was charged and goes back to the methods from Cambiar de medio", async () => {
      const { screen, callbacks } = await renderPanel(answering({ kind: "declined" }));

      await expect.element(screen.getByRole("heading", { name: "Point débito" })).toBeVisible();
      await expect.element(screen.getByText("A COBRAR")).toBeVisible();
      await expect.element(screen.getByRole("alert")).toHaveTextContent("Pago rechazado.");
      await expect.element(screen.getByText("No se aprobó")).not.toBeInTheDocument();
      await expect
        .poll(() => keycapOf(screen.getByRole("button", { name: "Cambiar de medio" })))
        .toBe("Enter");
      await expectNoAccessibilityViolations(screen.container);

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    });

    it.each(["{Escape}", "{Enter}"])("goes back to the methods with %s", async (key) => {
      const { screen, callbacks } = await renderPanel(answering({ kind: "declined" }));
      await expect.element(screen.getByRole("alert")).toHaveTextContent("Pago rechazado.");

      await userEvent.keyboard(key);

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
      const { callbacks } = await renderPanel(answering(outcome));

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    });

    it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
      "asks to check the session when following answers $kind",
      async (outcome) => {
        const { callbacks } = await renderPanel(answering(outcome));

        await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
      },
    );

    it("goes back to the methods when abandoning finds the order is not pending", async () => {
      const { screen, callbacks } = await renderPanel(undefined, async () => ({
        kind: "not_pending",
      }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
    });

    it("asks to check the session when abandoning finds it is no longer valid", async () => {
      const { screen, callbacks } = await renderPanel(undefined, async () => ({
        kind: "not_signed_in",
      }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    });
  });
});
