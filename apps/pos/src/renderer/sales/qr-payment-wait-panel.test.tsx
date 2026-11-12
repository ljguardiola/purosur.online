import type {
  AbandonMercadoPagoChargeOutcome,
  FollowMercadoPagoChargeOutcome,
} from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { ShownQrOrder } from "./qr-charge-panel";
import { QrPaymentWaitPanel } from "./qr-payment-wait-panel";

const TOTAL = 5_070_000;
const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
const ORDER = {
  kind: "order_shown",
  payment_transaction_id: PAYMENT_ID,
  amount: 3_000_000,
  remaining_seconds: 180,
  wait_seconds: 180,
} as const;
const WAITING: FollowMercadoPagoChargeOutcome = { kind: "waiting", remaining_seconds: 161 };
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
  order: ShownQrOrder = ORDER,
  abandon: Abandon = async () => ({ kind: "cancelled" }),
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const followCharge = vi.fn(follow);
  const abandonCharge = vi.fn(abandon);
  const callbacks = {
    onCancelled: vi.fn(),
    onChooseAnotherMethod: vi.fn(),
    onCompleted: vi.fn(),
    onRegenerate: vi.fn(),
    onPartiallyPaid: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(
    <QrPaymentWaitPanel
      order={order}
      follow={followCharge}
      abandon={abandonCharge}
      {...callbacks}
    />,
  );
  return { screen, followCharge, abandonCharge, callbacks };
}

function arcShare(container: Element): number {
  const arc = container.querySelector("circle[stroke-dasharray]");
  return Number.parseFloat(arc?.getAttribute("stroke-dasharray") ?? "");
}

describe("QrPaymentWaitPanel", () => {
  it("waits for the customer's payment showing what is owed, the order's steps and the time left", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByRole("complementary", { name: "Cobro con QR" })).toBeVisible();
    await expect.element(screen.getByRole("heading", { level: 2, name: "QR" })).toBeVisible();
    await expect.element(screen.getByText("A COBRAR")).toBeVisible();
    await expect.element(screen.getByText("$ 30.000,00", { exact: true }).first()).toBeVisible();
    await expect.element(screen.getByText("Orden creada por $ 30.000,00")).toBeVisible();
    await expect.element(screen.getByText("Esperando que el cliente pague")).toBeVisible();
    await expect.element(screen.getByText("Pago aprobado")).toBeVisible();
    await expect.element(screen.getByRole("timer", { name: "TIEMPO PARA PAGAR" })).toBeVisible();
    await expect.element(screen.getByText("2:41")).toBeVisible();
    for (const text of [
      "Esperando el pago del cliente",
      "Escanea el QR del mostrador con su app",
      "Al llegar a cero, la orden vence y el cliente ya no puede pagarla.",
      "Total de la venta",
      "A cobrar ahora",
      "QR DE MERCADO PAGO",
    ]) {
      await expect.element(screen.getByText(text)).not.toBeInTheDocument();
    }
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the whole wait the order was shown with until the core answers", async () => {
    const { screen } = await renderPanel(() => new Promise(() => {}));

    await expect.element(screen.getByText("3:00").first()).toBeVisible();
  });

  it("counts the time left out of the whole wait the order was shown with", async () => {
    const { screen } = await renderPanel(answering(WAITING), {
      ...ORDER,
      remaining_seconds: 188,
      wait_seconds: 190,
    });

    await expect.element(screen.getByText("2:41")).toBeVisible();
    expect(arcShare(screen.container)).toBeCloseTo((161 / 190) * 100, 3);
  });

  it("shows the whole wait as the total of a charge reopened part way through it", async () => {
    const { screen } = await renderPanel(answering({ kind: "waiting", remaining_seconds: 40 }), {
      ...ORDER,
      remaining_seconds: 40,
      wait_seconds: 190,
    });

    await expect.element(screen.getByText("0:40")).toBeVisible();
    expect(arcShare(screen.container)).toBeCloseTo((40 / 190) * 100, 3);
  });

  it("offers only Esc Cambiar de medio while waiting, with no footer button and no key beyond Esc", async () => {
    const { screen } = await renderPanel();

    await expect.element(screen.getByText("2:41")).toBeVisible();
    expect(
      screen
        .getByRole("button")
        .elements()
        .map((button) => button.textContent),
    ).toEqual(["EscCambiar de medio"]);
    const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
    expect(keys).toEqual(["Esc"]);
  });

  it("keeps asking the core about the payment while it waits", async () => {
    const { followCharge } = await renderPanel();

    await expect
      .poll(() => followCharge.mock.calls.length, { timeout: NEXT_ASK_TIMEOUT_MS })
      .toBeGreaterThan(1);
    expect(new Set(followCharge.mock.calls.map(([id]) => id))).toEqual(new Set([PAYMENT_ID]));
  });

  it("shows the customer paid, with the amount, and advances only from Continuar once the payment is approved", async () => {
    const { screen, callbacks } = await renderPanel(answering(WAITING, COMPLETED));

    await expect
      .element(screen.getByText("Pagado con QR"), {
        timeout: NEXT_ASK_TIMEOUT_MS,
      })
      .toBeVisible();
    await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
    await expect.element(screen.getByText("$ 30.000,00").first()).toBeVisible();
    await expect.element(screen.getByText("Falta cobrar")).not.toBeInTheDocument();
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
    expect(callbacks.onPartiallyPaid).not.toHaveBeenCalled();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(callbacks.onCompleted.mock.calls).toEqual([[{ ...COMPLETED, amount: 3_000_000 }]]);
  });

  it("offers only Continuar once the payment is approved", async () => {
    const { screen } = await renderPanel(answering(COMPLETED));

    await expect.element(screen.getByRole("button", { name: "Continuar" })).toBeVisible();
    expect(
      screen
        .getByRole("button")
        .elements()
        .map((button) => button.textContent),
    ).toEqual(["ContinuarEnter"]);
  });

  it("shows what is still to be charged and goes back to the methods only from Continuar when the approved payment pays part of the sale", async () => {
    const { screen, callbacks } = await renderPanel(answering(PARTIALLY_PAID));

    await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
    await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
    await expect.element(screen.getByText("Falta cobrar")).toBeVisible();
    await expect.element(screen.getByText("$ 10.700,00")).toBeVisible();
    expect(callbacks.onPartiallyPaid).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("says the core could not tell how the payment goes and asks again from Reintentar", async () => {
    const { screen, followCharge, callbacks } = await renderPanel(
      answering({ kind: "unavailable" }, WAITING),
    );

    await expect.element(screen.getByText("No se pudo consultar el pago del QR")).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
    expect(followCharge).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByText("2:41")).toBeVisible();
    expect(callbacks.onSaleUnavailable).not.toHaveBeenCalled();
  });

  it("offers Reintentar and Esc Cambiar de medio when the core cannot tell how the payment goes", async () => {
    const { screen } = await renderPanel(answering({ kind: "unavailable" }));

    await expect.element(screen.getByText("No se pudo consultar el pago del QR")).toBeVisible();

    expect(
      screen
        .getByRole("button")
        .elements()
        .map((button) => button.textContent),
    ).toEqual(["EscCambiar de medio", "Reintentar"]);
  });

  it("abandons the order from Cambiar de medio when the core cannot tell how the payment goes", async () => {
    const { screen, abandonCharge, callbacks } = await renderPanel(
      answering({ kind: "unavailable" }),
    );

    await expect.element(screen.getByText("No se pudo consultar el pago del QR")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect.poll(() => callbacks.onCancelled.mock.calls.length).toBe(1);
    expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
  });

  it("loads the time left again from its placeholder after Reintentar, not from the time the order was shown with", async () => {
    let answerAgain: (outcome: FollowMercadoPagoChargeOutcome) => void = () => undefined;
    const answers: Promise<FollowMercadoPagoChargeOutcome>[] = [
      Promise.resolve({ kind: "unavailable" }),
      new Promise((resolve) => {
        answerAgain = resolve;
      }),
    ];
    const { screen } = await renderPanel(() => answers.shift() ?? Promise.resolve(WAITING));

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await expect.element(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.getByRole("timer").elements()).toEqual([]);
    expect(screen.getByText("3:00").elements()).toEqual([]);

    answerAgain(WAITING);

    await expect.element(screen.getByText("2:41")).toBeVisible();
  });

  it("says Mercado Pago declined the payment and goes back to the methods from Cambiar de medio", async () => {
    const { screen, callbacks } = await renderPanel(answering({ kind: "declined" }));

    await expect.element(screen.getByText("Mercado Pago rechazó el pago")).toBeVisible();
    await expect
      .element(screen.getByText("El pago del QR no se aprobó, así que no se cobró nada."))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
  });

  it("shows the countdown over and keeps waiting for Mercado Pago to say the order expired", async () => {
    const { screen, followCharge } = await renderPanel(
      answering({ kind: "waiting", remaining_seconds: 0 }),
    );

    await expect
      .element(screen.getByText("Confirmando con Mercado Pago que la orden venció"))
      .toBeVisible();
    await expect.element(screen.getByText("0:00")).toBeVisible();
    await expect.element(screen.getByRole("timer", { name: "TIEMPO PARA PAGAR" })).toBeVisible();
    await expect
      .poll(() => followCharge.mock.calls.length, { timeout: NEXT_ASK_TIMEOUT_MS })
      .toBeGreaterThan(1);
  });

  it("says Mercado Pago no longer accepts the order once it answers expired, and goes back to the methods without cancelling anything", async () => {
    const { screen, abandonCharge, callbacks } = await renderPanel(
      answering({ kind: "wait_over" }),
    );

    await expect.element(screen.getByText("Venció la espera del QR")).toBeVisible();
    await expect
      .element(screen.getByText("El cliente ya no puede pagar esta orden."))
      .toBeVisible();
    await expect.element(screen.getByText(/tarea de reembolso/)).not.toBeInTheDocument();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(abandonCharge).not.toHaveBeenCalled();
    expect(callbacks.onCancelled).not.toHaveBeenCalled();
  });

  describe("when the core could not confirm the expiry", () => {
    const UNCONFIRMED: FollowMercadoPagoChargeOutcome = { kind: "expiry_unconfirmed" };

    async function renderUnconfirmed(abandon?: Abandon, follow: Follow = answering(UNCONFIRMED)) {
      const rendered = await renderPanel(follow, ORDER, abandon);
      await expect
        .element(rendered.screen.getByText("No se pudo confirmar el vencimiento del QR"))
        .toBeVisible();
      return rendered;
    }

    it("says it is not known whether the customer paid and that choosing another method cancels the order first", async () => {
      const { screen } = await renderUnconfirmed();

      await expect
        .element(
          screen.getByText(
            "No se pudo leer la orden en Mercado Pago, así que no se sabe si el cliente pagó. Al elegir otro medio, primero se cancela la orden QR.",
          ),
        )
        .toBeVisible();
      await expectNoAccessibilityViolations(screen.container);
    });

    it("cancels the order from Cambiar de medio and leaves the charge once it is cancelled", async () => {
      const { screen, abandonCharge, callbacks } = await renderUnconfirmed();

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

      await expect.poll(() => callbacks.onCancelled.mock.calls.length).toBe(1);
      expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
      expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
    });

    it("says the order could not be cancelled when the core cannot answer, and lets the cashier try again", async () => {
      const answers: AbandonMercadoPagoChargeOutcome[] = [
        { kind: "unavailable" },
        { kind: "cancelled" },
      ];
      const { screen, abandonCharge, callbacks } = await renderUnconfirmed(
        async () => answers.shift() ?? { kind: "cancelled" },
      );

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

      await expect
        .element(
          screen
            .getByText("No se pudo cancelar la orden QR. Volvé a intentarlo en unos segundos.")
            .first(),
        )
        .toBeVisible();
      expect(callbacks.onCancelled).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

      await expect.poll(() => callbacks.onCancelled.mock.calls.length).toBe(1);
      expect(abandonCharge).toHaveBeenCalledTimes(2);
    });

    it("disables Cambiar de medio while the order is being cancelled", async () => {
      let answer: (outcome: AbandonMercadoPagoChargeOutcome) => void = () => undefined;
      const { screen } = await renderUnconfirmed(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      );

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

      await expect
        .element(screen.getByRole("button", { name: "Cambiar de medio" }).last())
        .toBeDisabled();
      answer({ kind: "cancelled" });
    });

    it("says the order was already closed when the cancellation finds it so", async () => {
      const { screen } = await renderUnconfirmed(async () => ({ kind: "closed" }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

      await expect.element(screen.getByText("La orden QR ya estaba cerrada")).toBeVisible();
    });

    it("warns that the cancellation could not be confirmed when the order was replaced", async () => {
      const { screen } = await renderUnconfirmed(async () => ({ kind: "replaced" }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

      await expect
        .element(screen.getByText("No se pudo confirmar la cancelación del QR"))
        .toBeVisible();
    });

    it("shows the customer paid, without advancing, when the cancellation finds the order paid", async () => {
      const { screen, callbacks } = await renderUnconfirmed(async () => ({
        kind: "already_paid",
        settlement: COMPLETED,
      }));

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

      await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
      expect(callbacks.onCompleted).not.toHaveBeenCalled();
      expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
    });

    it("keeps following the order and shows it paid when a later answer reads it so", async () => {
      const { screen } = await renderUnconfirmed(undefined, answering(UNCONFIRMED, COMPLETED));

      await expect
        .element(screen.getByText("Pagado con QR"), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
    });

    it("keeps following the order and shows it expired when a later answer reads it so", async () => {
      const { screen } = await renderUnconfirmed(
        undefined,
        answering(UNCONFIRMED, { kind: "wait_over" }),
      );

      await expect
        .element(screen.getByText("Venció la espera del QR"), {
          timeout: NEXT_ASK_TIMEOUT_MS,
        })
        .toBeVisible();
    });
  });

  it.each([
    { kind: "not_pending" },
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "no_buyer_identification_threshold" },
    { kind: "reaches_buyer_identification_threshold", threshold: 1_000_000 },
  ] as const)(
    "leaves the charge when the sale can no longer be charged ($kind)",
    async (outcome) => {
      const { callbacks } = await renderPanel(answering(outcome));

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    },
  );

  it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
    "leaves the charge when the session is no longer valid ($kind)",
    async (outcome) => {
      const { callbacks } = await renderPanel(answering(outcome));

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("abandons the order from Cambiar de medio and leaves the charge once it is cancelled", async () => {
    const { screen, abandonCharge, callbacks } = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect.poll(() => callbacks.onCancelled.mock.calls.length).toBe(1);
    expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
    expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
  });

  it("disables Cambiar de medio while the core abandons the order, and stops asking about the payment", async () => {
    let answer: (outcome: AbandonMercadoPagoChargeOutcome) => void = () => undefined;
    const { screen, followCharge, abandonCharge } = await renderPanel(
      answering(WAITING),
      ORDER,
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect.element(screen.getByRole("button", { name: "Cambiar de medio" })).toBeDisabled();
    const asked = followCharge.mock.calls.length;
    await expect.poll(() => abandonCharge.mock.calls.length).toBe(1);
    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }), {
      force: true,
    });
    expect(abandonCharge).toHaveBeenCalledOnce();
    expect(followCharge.mock.calls.length).toBe(asked);
    answer({ kind: "cancelled" });
  });

  it("does not abandon anything from the Cambiar de medio of a declined order", async () => {
    const { screen, abandonCharge, callbacks } = await renderPanel(answering({ kind: "declined" }));

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    expect(abandonCharge).not.toHaveBeenCalled();
  });

  it("shows the customer paid when the cancellation finds the order paid, and reports the completed sale only from Continuar", async () => {
    const { screen, callbacks } = await renderPanel(answering(WAITING), ORDER, async () => ({
      kind: "already_paid",
      settlement: COMPLETED,
    }));

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
    await expect.element(screen.getByText("$ 30.000,00").first()).toBeVisible();
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
    expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(callbacks.onCompleted.mock.calls).toEqual([[{ ...COMPLETED, amount: 3_000_000 }]]);
  });

  it("shows the customer paid when the cancellation finds the order paid part of the sale, and goes back to the methods only from Continuar", async () => {
    const { screen, callbacks } = await renderPanel(answering(WAITING), ORDER, async () => ({
      kind: "already_paid",
      settlement: PARTIALLY_PAID,
    }));

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
    await expect.element(screen.getByText("$ 10.700,00")).toBeVisible();
    expect(callbacks.onPartiallyPaid).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it.each([
    ["not pending", { kind: "not_pending" }],
    [
      "already paid with a settlement that is not pending",
      { kind: "already_paid", settlement: { kind: "not_pending" } },
    ],
  ] as const)(
    "goes back to the methods to read the sale again when the order is %s",
    async (_name, outcome) => {
      const { screen, callbacks } = await renderPanel(
        answering(WAITING),
        ORDER,
        async () => outcome,
      );

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect.poll(() => callbacks.onChooseAnotherMethod.mock.calls.length).toBe(1);
    },
  );

  it.each([
    ["not pending", { kind: "not_pending" }],
    [
      "already paid with a settlement that is not pending",
      { kind: "already_paid", settlement: { kind: "not_pending" } },
    ],
  ] as const)(
    "keeps showing the customer paid until Continuar when the payment was seen before the cancellation answers the order is %s",
    async (_name, outcome) => {
      let settleFollow: (outcome: FollowMercadoPagoChargeOutcome) => void = () => undefined;
      let answerAbandon: (outcome: AbandonMercadoPagoChargeOutcome) => void = () => undefined;
      const { screen, abandonCharge, callbacks } = await renderPanel(
        () =>
          new Promise((resolve) => {
            settleFollow = resolve;
          }),
        ORDER,
        () =>
          new Promise((resolve) => {
            answerAbandon = resolve;
          }),
      );

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));
      settleFollow(COMPLETED);
      await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
      answerAbandon(outcome);
      await abandonCharge.mock.results[0]?.value;

      await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

      expect(callbacks.onCompleted.mock.calls).toEqual([[{ ...COMPLETED, amount: 3_000_000 }]]);
      expect(callbacks.onChooseAnotherMethod).not.toHaveBeenCalled();
    },
  );

  it("says the order was already closed and nothing was charged, and goes back to the methods", async () => {
    const { screen, callbacks } = await renderPanel(answering(WAITING), ORDER, async () => ({
      kind: "closed",
    }));

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect.element(screen.getByText("La orden QR ya estaba cerrada")).toBeVisible();
    await expect
      .element(screen.getByText("No se cobró nada con el QR. Elegí otro medio."))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
  });

  it("warns that the cancellation could not be confirmed and that a late payment opens a refund task", async () => {
    const { screen, callbacks } = await renderPanel(answering(WAITING), ORDER, async () => ({
      kind: "replaced",
    }));

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect
      .element(screen.getByText("No se pudo confirmar la cancelación del QR"))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Podés cobrar con otro medio y completar la venta. Si el cliente paga el QR después, se crea una tarea de reembolso para confirmar.",
        ),
      )
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Cobrar con otro medio" }));

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
  });

  it.each([
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "no_buyer_identification_threshold" },
    { kind: "reaches_buyer_identification_threshold", threshold: 1_000_000 },
  ] as const)(
    "leaves the charge when abandoning finds the sale can no longer be charged ($kind)",
    async (outcome) => {
      const { screen, callbacks } = await renderPanel(
        answering(WAITING),
        ORDER,
        async () => outcome,
      );

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    },
  );

  it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
    "leaves the charge when abandoning finds the session is no longer valid ($kind)",
    async (outcome) => {
      const { screen, callbacks } = await renderPanel(
        answering(WAITING),
        ORDER,
        async () => outcome,
      );

      await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("says the order could not be cancelled when the core cannot answer, and lets the cashier try again", async () => {
    const answers: AbandonMercadoPagoChargeOutcome[] = [
      { kind: "unavailable" },
      { kind: "cancelled" },
    ];
    const { screen, abandonCharge, callbacks } = await renderPanel(
      answering(WAITING),
      ORDER,
      async () => answers.shift() ?? { kind: "cancelled" },
    );

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));

    await expect
      .element(
        screen
          .getByText("No se pudo cancelar la orden QR. Volvé a intentarlo en unos segundos.")
          .first(),
      )
      .toBeVisible();
    expect(callbacks.onCancelled).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }).last());

    await expect.poll(() => callbacks.onCancelled.mock.calls.length).toBe(1);
    expect(abandonCharge).toHaveBeenCalledTimes(2);
  });

  it("marks the order that could not be cancelled with a crossed circle", async () => {
    const { screen } = await renderPanel(answering(WAITING), ORDER, async () => ({
      kind: "unavailable",
    }));

    await userEvent.click(screen.getByRole("button", { name: "Cambiar de medio" }));
    const notice = screen
      .getByText("No se pudo cancelar la orden QR. Volvé a intentarlo en unos segundos.")
      .first();
    await expect.element(notice).toBeVisible();

    let frame = notice.element().parentElement;
    while (frame !== null && frame.querySelector("svg") === null) {
      frame = frame.parentElement;
    }
    expect(frame?.querySelector("svg")?.getAttribute("class")).toContain("lucide-circle-x");
  });

  it("abandons the order with Esc while waiting", async () => {
    const { screen, abandonCharge, callbacks } = await renderPanel();
    await expect.element(screen.getByText("2:41")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => callbacks.onCancelled.mock.calls.length).toBe(1);
    expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
  });

  it("abandons the order once, not again, with Esc while it is being abandoned", async () => {
    const { screen, abandonCharge } = await renderPanel(
      answering(WAITING),
      ORDER,
      () => new Promise(() => {}),
    );
    await expect.element(screen.getByText("2:41")).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");

    await expect.poll(() => abandonCharge.mock.calls.length).toBe(1);
  });

  describe("when the order could not be abandoned", () => {
    async function renderAbandonFailed() {
      const answers: AbandonMercadoPagoChargeOutcome[] = [
        { kind: "unavailable" },
        { kind: "cancelled" },
      ];
      const rendered = await renderPanel(
        answering(WAITING),
        ORDER,
        async () => answers.shift() ?? { kind: "cancelled" },
      );
      await expect.element(rendered.screen.getByText("2:41")).toBeVisible();
      await userEvent.keyboard("{Escape}");
      await expect
        .element(
          rendered.screen.getByText(
            "No se pudo cancelar la orden QR. Volvé a intentarlo en unos segundos.",
          ),
        )
        .toBeVisible();
      return rendered;
    }

    it("shows only what is owed, the red notice and Cambiar de medio, with no timer and no steps", async () => {
      const { screen } = await renderAbandonFailed();

      await expect.element(screen.getByText("A COBRAR")).toBeVisible();
      await expect.element(screen.getByText("$ 30.000,00", { exact: true })).toBeVisible();
      await expect.element(screen.getByRole("timer")).not.toBeInTheDocument();
      await expect.element(screen.getByText("Pago aprobado")).not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("button", { name: "Cambiar de medio" }).last())
        .toMatchTextContent("Enter");
      await expectNoAccessibilityViolations(screen.container);
    });

    it("tries again with Enter", async () => {
      const { abandonCharge, callbacks } = await renderAbandonFailed();

      await userEvent.keyboard("{Enter}");

      await expect.poll(() => callbacks.onCancelled.mock.calls.length).toBe(1);
      expect(abandonCharge).toHaveBeenCalledTimes(2);
    });

    it("tries again with Esc", async () => {
      const { abandonCharge, callbacks } = await renderAbandonFailed();

      await userEvent.keyboard("{Escape}");

      await expect.poll(() => callbacks.onCancelled.mock.calls.length).toBe(1);
      expect(abandonCharge).toHaveBeenCalledTimes(2);
    });
  });

  describe("paid", () => {
    it("shows the QR panel with what was charged and Continuar with Enter, without Esc", async () => {
      const { screen, callbacks } = await renderPanel(answering(COMPLETED));

      await expect.element(screen.getByRole("heading", { level: 2, name: "QR" })).toBeVisible();
      await expect.element(screen.getByText("COBRADO")).toBeVisible();
      await expect.element(screen.getByText("Pagado con QR")).toBeVisible();
      const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
      expect(keys).toEqual(["Enter"]);

      await userEvent.keyboard("{Enter}");

      expect(callbacks.onCompleted.mock.calls).toEqual([[{ ...COMPLETED, amount: 3_000_000 }]]);
    });

    it("goes back to the methods with Enter when only part of the sale was paid", async () => {
      const { screen, callbacks } = await renderPanel(answering(PARTIALLY_PAID));
      await expect.element(screen.getByText("Falta cobrar")).toBeVisible();

      await userEvent.keyboard("{Enter}");

      await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    });
  });

  describe.each([
    {
      name: "declined",
      follow: { kind: "declined" },
      title: "Mercado Pago rechazó el pago",
      description: "El pago del QR no se aprobó, así que no se cobró nada.",
    },
    {
      name: "wait over",
      follow: { kind: "wait_over" },
      title: "Venció la espera del QR",
      description: "El cliente ya no puede pagar esta orden.",
    },
  ] as const)("when the order is $name", ({ follow, title, description }) => {
    async function renderEnded() {
      const rendered = await renderPanel(answering(follow));
      await expect.element(rendered.screen.getByText(title)).toBeVisible();
      return rendered;
    }

    it("shows the amount, the notice, the keys of the screen and no other text", async () => {
      const { screen } = await renderEnded();

      await expect.element(screen.getByText(description)).toBeVisible();
      await expect.element(screen.getByText("A COBRAR")).toBeVisible();
      await expect.element(screen.getByText("$ 30.000,00", { exact: true })).toBeVisible();
      await expect
        .element(screen.getByText("Se puede volver a generar el QR o cobrar con otro medio."))
        .not.toBeInTheDocument();
      const keys = [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent);
      expect(keys.sort()).toEqual(["Enter", "Esc", "F2"]);
      await expect
        .element(screen.getByRole("button", { name: "Volver a generar el QR" }))
        .toMatchTextContent("F2");
      await expectNoAccessibilityViolations(screen.container);
    });

    it("goes back to the methods with Esc and with Enter, without abandoning anything", async () => {
      const { abandonCharge, callbacks } = await renderEnded();

      await userEvent.keyboard("{Escape}");
      await userEvent.keyboard("{Enter}");

      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledTimes(2);
      expect(abandonCharge).not.toHaveBeenCalled();
    });

    it("regenerates the QR for the same amount with F2 and from its link", async () => {
      const { screen, callbacks } = await renderEnded();

      await userEvent.keyboard("{F2}");
      await userEvent.click(screen.getByRole("button", { name: "Volver a generar el QR" }));

      expect(callbacks.onRegenerate.mock.calls).toEqual([[3_000_000], [3_000_000]]);
    });
  });

  describe("when the order is closed, replaced or not confirmed to have expired", () => {
    it("closed: informs nothing was charged, with no regenerate and Cambiar de medio on Enter and Esc", async () => {
      const { screen, callbacks } = await renderPanel(answering(WAITING), ORDER, async () => ({
        kind: "closed",
      }));
      await userEvent.keyboard("{Escape}");
      await expect.element(screen.getByText("La orden QR ya estaba cerrada")).toBeVisible();

      expect(
        [...screen.container.querySelectorAll("kbd")].map((key) => key.textContent).sort(),
      ).toEqual(["Enter", "Esc"]);
      await userEvent.keyboard("{F2}");
      await userEvent.keyboard("{Enter}");

      expect(callbacks.onRegenerate).not.toHaveBeenCalled();
      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    });

    it("replaced: offers Cobrar con otro medio on Enter and Cambiar de medio on Esc, with no regenerate", async () => {
      const { screen, callbacks } = await renderPanel(answering(WAITING), ORDER, async () => ({
        kind: "replaced",
      }));
      await userEvent.keyboard("{Escape}");
      await expect
        .element(screen.getByText("No se pudo confirmar la cancelación del QR"))
        .toBeVisible();

      await expect
        .element(screen.getByRole("button", { name: "Volver a generar el QR" }))
        .not.toBeInTheDocument();
      await userEvent.keyboard("{F2}");
      await userEvent.keyboard("{Enter}");

      expect(callbacks.onRegenerate).not.toHaveBeenCalled();
      expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
    });

    it("not confirmed to have expired: cancels the order with Esc and with Enter, with no regenerate", async () => {
      const { screen, abandonCharge, callbacks } = await renderPanel(
        answering({ kind: "expiry_unconfirmed" }),
      );
      await expect
        .element(screen.getByText("No se pudo confirmar el vencimiento del QR"))
        .toBeVisible();
      await userEvent.keyboard("{F2}");
      expect(callbacks.onRegenerate).not.toHaveBeenCalled();

      await userEvent.keyboard("{Enter}");

      await expect.poll(() => callbacks.onCancelled.mock.calls.length).toBe(1);
      expect(abandonCharge).toHaveBeenCalledExactlyOnceWith(PAYMENT_ID);
    });
  });
});
