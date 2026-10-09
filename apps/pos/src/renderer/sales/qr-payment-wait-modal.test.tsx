import type { FollowMercadoPagoQrChargeOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import { QrPaymentWaitModal } from "./qr-payment-wait-modal";

const TOTAL = 5_070_000;
const PAYMENT_ID = "019a0000-0000-7000-8000-0000000000a1";
const ORDER = {
  kind: "order_shown",
  payment_transaction_id: PAYMENT_ID,
  amount: 3_000_000,
  remaining_seconds: 180,
} as const;
const WAITING: FollowMercadoPagoQrChargeOutcome = { kind: "waiting", remaining_seconds: 161 };

type Follow = (paymentTransactionId: string) => Promise<FollowMercadoPagoQrChargeOutcome>;

function answering(...outcomes: FollowMercadoPagoQrChargeOutcome[]): Follow {
  return async () => (outcomes.length > 1 ? outcomes.shift() : outcomes[0]) ?? WAITING;
}

async function renderModal(follow: Follow = answering(WAITING)) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const followCharge = vi.fn(follow);
  const callbacks = {
    onChooseAnotherMethod: vi.fn(),
    onCompleted: vi.fn(),
    onPartiallyPaid: vi.fn(),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(
    <QrPaymentWaitModal
      total={TOTAL}
      paid={1_000_000}
      order={ORDER}
      follow={followCharge}
      {...callbacks}
    />,
  );
  return { screen, followCharge, callbacks };
}

describe("QrPaymentWaitModal", () => {
  it("waits for the customer's payment showing what is owed, the order's steps and the time left", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("QR DE MERCADO PAGO")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Esperando el pago del cliente" }))
      .toBeVisible();
    await expect.element(screen.getByText("Total de la venta")).toBeVisible();
    await expect.element(screen.getByText("$ 50.700,00")).toBeVisible();
    await expect.element(screen.getByText("Pagado")).toBeVisible();
    await expect.element(screen.getByText("$ 10.000,00")).toBeVisible();
    await expect.element(screen.getByText("A cobrar ahora")).toBeVisible();
    await expect.element(screen.getByText("Orden creada por $ 30.000,00")).toBeVisible();
    await expect.element(screen.getByText("Esperando que el cliente pague")).toBeVisible();
    await expect.element(screen.getByText("Escanea el QR del mostrador con su app")).toBeVisible();
    await expect.element(screen.getByText("Pago aprobado")).toBeVisible();
    await expect.element(screen.getByRole("timer", { name: "Tiempo para pagar" })).toBeVisible();
    await expect.element(screen.getByText("2:41")).toBeVisible();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(
        "Al llegar a cero, volvés a elegir medio. Si el cliente paga después, queda una tarea de reembolso para confirmar.",
      );
    await expectNoAccessibilityViolations(screen.container);
  });

  it("shows the whole wait the order was shown with until the core answers", async () => {
    const { screen } = await renderModal(() => new Promise(() => {}));

    await expect.element(screen.getByText("3:00").first()).toBeVisible();
  });

  it("offers no way to leave the payment while waiting", async () => {
    const { screen } = await renderModal();

    await expect.element(screen.getByText("2:41")).toBeVisible();
    expect(screen.getByRole("button").elements()).toEqual([]);
  });

  it("keeps asking the core about the payment while it waits", async () => {
    const { followCharge } = await renderModal();

    await expect.poll(() => followCharge.mock.calls.length).toBeGreaterThan(1);
    expect(new Set(followCharge.mock.calls.map(([id]) => id))).toEqual(new Set([PAYMENT_ID]));
  });

  it("reports the completed sale with the amount charged once the payment is approved", async () => {
    const completed = { kind: "completed", sale_id: "sale-1", total: TOTAL } as const;
    const { callbacks } = await renderModal(answering(WAITING, completed));

    await expect
      .poll(() => callbacks.onCompleted.mock.calls)
      .toEqual([[{ ...completed, amount: 3_000_000 }]]);
  });

  it("keeps waiting, asking again, when the core cannot answer once", async () => {
    const { screen, followCharge, callbacks } = await renderModal(
      answering({ kind: "unavailable" }, WAITING),
    );

    await expect.element(screen.getByText("2:41")).toBeVisible();
    expect(followCharge.mock.calls.length).toBeGreaterThan(1);
    expect(callbacks.onSaleUnavailable).not.toHaveBeenCalled();
  });

  it("goes back to the methods with the new balance when the approved payment pays part of the sale", async () => {
    const { callbacks } = await renderModal(
      answering({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: TOTAL,
        paid: 4_000_000,
        pending: 1_070_000,
      }),
    );

    await expect.poll(() => callbacks.onPartiallyPaid.mock.calls.length).toBe(1);
    expect(callbacks.onCompleted).not.toHaveBeenCalled();
  });

  it("says Mercado Pago declined the payment and goes back to the methods from Elegir otro medio", async () => {
    const { screen, callbacks } = await renderModal(answering({ kind: "declined" }));

    await expect
      .element(screen.getByRole("heading", { name: "Mercado Pago rechazó el pago" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("El pago del QR no se aprobó, así que no se cobró nada."))
      .toBeVisible();
    await expect
      .element(screen.getByText("Se puede volver a generar el QR o cobrar con otro medio."))
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
  });

  it("says the wait ran out and goes back to the methods from Elegir otro medio", async () => {
    const { screen, callbacks } = await renderModal(answering({ kind: "wait_over" }));

    await expect
      .element(screen.getByRole("heading", { name: "Venció la espera del QR" }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText("Pasaron 3 minutos y el cliente no pagó. Para seguir, elegí otro medio."),
      )
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Si el cliente paga el QR después, ese pago se devuelve: se crea una tarea de reembolso.",
        ),
      )
      .toBeVisible();
    await expectNoAccessibilityViolations(screen.container);

    await userEvent.click(screen.getByRole("button", { name: "Elegir otro medio" }));

    expect(callbacks.onChooseAnotherMethod).toHaveBeenCalledOnce();
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
      const { callbacks } = await renderModal(answering(outcome));

      await expect.poll(() => callbacks.onSaleUnavailable.mock.calls.length).toBe(1);
    },
  );

  it.each([{ kind: "not_signed_in" }, { kind: "no_open_session" }] as const)(
    "leaves the charge when the session is no longer valid ($kind)",
    async (outcome) => {
      const { callbacks } = await renderModal(answering(outcome));

      await expect.poll(() => callbacks.onSessionInvalid.mock.calls.length).toBe(1);
    },
  );
});
