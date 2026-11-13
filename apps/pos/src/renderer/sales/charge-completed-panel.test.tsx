import type { AnswerReceiptQuestionOutcome, ReceiptPrintStatusOutcome } from "@purosur/contracts";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "../shell/test-support/render-with-router";
import type { CompletedPayment } from "./charge-completed-panel";
import { ChargeCompletedPanel } from "./charge-completed-panel";

const PRINTED: ReceiptPrintStatusOutcome = {
  kind: "found",
  next_copy: { kind: "original" },
  printed: true,
  standing: "printed",
  comprobante: { kind: "none" },
  offer: null,
};
const SALE = { sale_id: "sale-1", total: 476_000 } as const;

async function renderPanel(
  payment: CompletedPayment,
  readReceiptStatus: () => Promise<ReceiptPrintStatusOutcome> = async () => PRINTED,
  answerReceiptQuestion: (
    saleId: string,
    print: boolean,
  ) => Promise<AnswerReceiptQuestionOutcome> = async () => ({ kind: "printing" }),
) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const screen = await render(
    <ChargeCompletedPanel
      saleId="sale-1"
      payment={payment}
      readReceiptStatus={vi.fn(readReceiptStatus)}
      answerReceiptQuestion={answerReceiptQuestion}
      readBackupTicket={vi.fn(async () => ({ kind: "unavailable" as const }))}
      readBackupTickets={vi.fn(async () => ({ kind: "unavailable" as const }))}
      mayChangePrinter={false}
      onNewSale={vi.fn()}
    />,
  );
  return screen;
}

describe("ChargeCompletedPanel", () => {
  it("shows the cash rounding of a cash charge", async () => {
    const screen = await renderPanel({
      method: "CASH",
      charge: {
        kind: "completed",
        sale_id: "sale-1",
        total: 2_519_250,
        tendered: 3_000_000,
        change: 490_000,
        cash_rounding: 9_250,
      },
    });

    await expect.element(screen.getByText("Redondeo")).toBeVisible();
    await expect.element(screen.getByText("– $ 92,50")).toBeVisible();
  });

  it("shows the cash handed over and the change of a cash charge", async () => {
    const screen = await renderPanel({
      method: "CASH",
      charge: { kind: "completed", ...SALE, tendered: 500_000, change: 24_000, cash_rounding: 0 },
    });

    await expect.element(screen.getByText("VUELTO", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Efectivo", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 5.000,00")).toBeVisible();
  });

  it.each([
    ["TRANSFER", "Transferencia"],
    ["QR", "QR de Mercado Pago"],
    ["STANDALONE_TERMINAL", "Terminal independiente"],
  ] as const)(
    "shows what the last %s charge paid, beside the sale's total",
    async (method, label) => {
      const screen = await renderPanel({
        method,
        charge: { kind: "completed", ...SALE, amount: 300_000 },
      });

      await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
      await expect.element(screen.getByText(label, { exact: true })).toBeVisible();
      await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
      await expect.element(screen.getByText("$ 4.760,00")).toBeVisible();
    },
  );

  it.each([
    ["DEBIT", "Point · Débito"],
    ["CREDIT", "Point · Crédito"],
    [null, "Point"],
  ] as const)("shows what the last %s Point charge paid under %s", async (cardType, label) => {
    const screen = await renderPanel({
      method: "POINT",
      cardType,
      charge: { kind: "completed", ...SALE, amount: 300_000 },
    });

    await expect.element(screen.getByText(label, { exact: true })).toBeVisible();
    await expect.element(screen.getByText("$ 3.000,00")).toBeVisible();
  });

  it.each([
    [
      "QR",
      "QR de Mercado Pago",
      true,
      "Reembolso pendiente de $ 240,00 por Mercado Pago La nube lo envía a Mercado Pago cuando alguien lo confirma en el backoffice.",
    ],
    [
      "POINT",
      "Point",
      false,
      "Reembolso pendiente de $ 240,00 por Mercado Pago Lo devuelve una persona desde Mercado Pago, cuando lo atiende en el backoffice.",
    ],
  ] as const)(
    "shows the amount of the %s paid order applied and how its surplus goes back to the customer",
    async (orderMethod, label, sentByCloud, surplusNotice) => {
      const screen = await renderPanel({
        method: "PAID_ORDER",
        orderMethod,
        charge: {
          kind: "completed",
          ...SALE,
          applied: 500_000,
          surplus: 24_000,
          surplus_sent_by_cloud: sentByCloud,
        },
      });

      await expect.element(screen.getByRole("heading", { name: "Venta completada" })).toBeVisible();
      await expect.element(screen.getByText(label, { exact: true })).toBeVisible();
      await expect.element(screen.getByText("$ 5.000,00")).toBeVisible();
      await expect.element(screen.getByRole("status")).toHaveTextContent(surplusNotice);
    },
  );

  it("hands the cashier's answer about the ticket to the core, with the sale's id", async () => {
    const answerReceiptQuestion = vi.fn(
      async (): Promise<AnswerReceiptQuestionOutcome> => ({ kind: "declined" }),
    );
    const screen = await renderPanel(
      {
        method: "CASH",
        charge: { kind: "completed", ...SALE, tendered: 500_000, change: 24_000, cash_rounding: 0 },
      },
      async () => ({
        ...PRINTED,
        printed: false,
        standing: "awaiting_answer",
        offer: { remaining_ms: 3000, length_ms: 3000 },
      }),
      answerReceiptQuestion,
    );

    await userEvent.click(screen.getByRole("button", { name: "Omitir" }));

    await expect.poll(() => answerReceiptQuestion.mock.calls).toEqual([["sale-1", false]]);
  });
});
