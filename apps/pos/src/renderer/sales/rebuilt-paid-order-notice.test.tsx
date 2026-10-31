import type { ChargeSaleWithPaidOrderOutcome } from "@purosur/contracts";
import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RebuiltPaidOrderNotice } from "./rebuilt-paid-order-notice";

const APPLY = "Cobrar con el pago de Mercado Pago";
const FAILED = "No se pudo cobrar con el pago de Mercado Pago. Probá de nuevo.";
const QR_ORDER = {
  payment_transaction_id: "order-1",
  method: "QR",
  amount: 500_000,
  applied: false,
} as const;
const COMPLETED = {
  kind: "completed",
  sale_id: "sale-1",
  total: 476_000,
  applied: 476_000,
  surplus: 24_000,
  surplus_sent_by_cloud: true,
} as const satisfies ChargeSaleWithPaidOrderOutcome;

async function renderNotice({
  paidOrder = QR_ORDER,
  apply = async () => COMPLETED,
}: {
  paidOrder?: { payment_transaction_id: string; method: "QR" | "POINT"; amount: number };
  apply?: () => Promise<ChargeSaleWithPaidOrderOutcome>;
} = {}) {
  const callbacks = {
    apply: vi.fn(apply),
    onCompleted: vi.fn(),
    onPartiallyPaid: vi.fn(async () => {}),
    onSaleChanged: vi.fn(async () => {}),
    onSaleUnavailable: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  const screen = await render(
    <RebuiltPaidOrderNotice paidOrder={{ ...paidOrder, applied: false }} {...callbacks} />,
  );
  return { screen, ...callbacks };
}

describe("RebuiltPaidOrderNotice", () => {
  it("names the QR paid order with its amount and asks to apply it before another method", async () => {
    const { screen } = await renderNotice();

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(
        "Pago con QR de Mercado Pago de $ 5.000,00 Aplicalo a la venta antes de cobrar con otro medio.",
      );
    await expect.element(screen.getByRole("button", { name: APPLY })).toBeVisible();
    await expectNoAccessibilityViolations(screen.container);
  });

  it("names a Point paid order as Point", async () => {
    const { screen } = await renderNotice({ paidOrder: { ...QR_ORDER, method: "POINT" } });

    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(
        "Pago con Point de $ 5.000,00 Aplicalo a la venta antes de cobrar con otro medio.",
      );
  });

  it("applies the order once, even pressed twice, and hands over the completed charge", async () => {
    const { screen, apply, onCompleted } = await renderNotice();
    const button = screen.getByRole("button", { name: APPLY });
    await expect.element(button).toBeVisible();
    const element = button.element() as HTMLElement;

    element.click();
    element.click();

    await expect.poll(() => onCompleted.mock.calls).toEqual([[COMPLETED]]);
    expect(apply).toHaveBeenCalledOnce();
  });

  it("hands over a charge the order paid only part of", async () => {
    const { screen, onPartiallyPaid } = await renderNotice({
      apply: async () => ({
        kind: "partially_paid",
        sale_id: "sale-1",
        total: 900_000,
        paid: 500_000,
        pending: 400_000,
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect.poll(() => onPartiallyPaid.mock.calls.length).toBe(1);
  });

  it.each(["no_paid_order", "already_applied"] as const)(
    "tells the sale changed when the core answers %s",
    async (kind) => {
      const { screen, onSaleChanged } = await renderNotice({ apply: async () => ({ kind }) });

      await userEvent.click(screen.getByRole("button", { name: APPLY }));

      await expect.poll(() => onSaleChanged.mock.calls.length).toBe(1);
    },
  );

  it.each([
    { kind: "empty_sale" },
    { kind: "zero_total" },
    { kind: "no_open_sale" },
    { kind: "not_permitted" },
    { kind: "reaches_buyer_identification_threshold", threshold: 476_000 },
    { kind: "no_buyer_identification_threshold" },
  ] as const satisfies ChargeSaleWithPaidOrderOutcome[])(
    "tells the sale cannot be charged when the core answers %j",
    async (outcome) => {
      const { screen, onSaleUnavailable } = await renderNotice({ apply: async () => outcome });

      await userEvent.click(screen.getByRole("button", { name: APPLY }));

      await expect.poll(() => onSaleUnavailable.mock.calls.length).toBe(1);
    },
  );

  it.each(["not_signed_in", "no_open_session"] as const)(
    "reports an invalid session when the core answers %s",
    async (kind) => {
      const { screen, onSessionInvalid } = await renderNotice({ apply: async () => ({ kind }) });

      await userEvent.click(screen.getByRole("button", { name: APPLY }));

      await expect.poll(() => onSessionInvalid.mock.calls.length).toBe(1);
    },
  );

  it("says the order could not be applied when the core is unavailable, and lets try again", async () => {
    const { screen, apply } = await renderNotice({
      apply: async () => ({ kind: "unavailable" }),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect.element(screen.getByRole("alert")).toHaveTextContent(FAILED);
    await userEvent.click(screen.getByRole("button", { name: APPLY }));
    await expect.poll(() => apply.mock.calls.length).toBe(2);
  });

  it("treats a failed request as the core being unavailable", async () => {
    const { screen } = await renderNotice({
      apply: () => Promise.reject(new Error("the core connection was replaced")),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect.element(screen.getByRole("alert")).toHaveTextContent(FAILED);
  });

  it("says the register is being restored", async () => {
    const { screen } = await renderNotice({
      apply: async () => ({ kind: "restoration_in_progress" }),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect
      .element(screen.getByRole("alert"))
      .toHaveTextContent("La caja se está restaurando. Esperá a que termine.");
  });

  it("clears the problem shown once the order is applied again", async () => {
    const { screen } = await renderNotice({
      apply: vi
        .fn<() => Promise<ChargeSaleWithPaidOrderOutcome>>()
        .mockResolvedValueOnce({ kind: "unavailable" })
        .mockResolvedValueOnce({ kind: "already_applied" }),
    });

    await userEvent.click(screen.getByRole("button", { name: APPLY }));
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: APPLY }));

    await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  });
});
