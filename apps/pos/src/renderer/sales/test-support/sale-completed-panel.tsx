import type {
  AnswerReceiptQuestionOutcome,
  ReadContingencyBackupTicketOfSaleOutcome,
  ReadContingencyBackupTicketsOutcome,
  ReceiptPrintStatusOutcome,
} from "@purosur/contracts";
import { expect, onTestFinished, vi } from "vitest";
import { page } from "vitest/browser";
import { backupTickets } from "../../shell/test-support/contingency-backup-tickets";
import { render } from "../../shell/test-support/render-with-router";
import { SaleCompletedPanel } from "../sale-completed-panel";

type Found = Extract<ReceiptPrintStatusOutcome, { kind: "found" }>;

export type Standing = Found["standing"];

export type Comprobante = Found["comprobante"];

const DEFAULT_OFFER = { remaining_ms: 10_000, length_ms: 10_000 };

export function found(
  standing: Standing,
  {
    printed = false,
    comprobante = { kind: "none" },
    offer = standing === "awaiting_answer" ? DEFAULT_OFFER : null,
  }: { printed?: boolean; comprobante?: Comprobante; offer?: Found["offer"] } = {},
): ReceiptPrintStatusOutcome {
  return { kind: "found", next_copy: { kind: "original" }, printed, standing, comprobante, offer };
}

export type Amounts =
  | { total: number; tendered: number; change: number; cashRounding: number }
  | {
      total: number;
      method: "QR";
      amount: number;
      surplusRefund: { amount: number; sentByCloud: boolean };
    }
  | {
      total: number;
      method: "POINT";
      cardType: null;
      amount: number;
      surplusRefund: { amount: number; sentByCloud: boolean };
    }
  | { total: number; method: "TRANSFER"; amount: number }
  | { total: number; method: "QR"; amount: number }
  | { total: number; method: "POINT"; cardType: "DEBIT" | "CREDIT" | null; amount: number }
  | { total: number; method: "STANDALONE_TERMINAL"; amount: number };

export type BackupStanding = Extract<
  ReadContingencyBackupTicketOfSaleOutcome,
  { kind: "read" }
>["ticket"]["standing"];

export function ticketOf(standing: BackupStanding): ReadContingencyBackupTicketOfSaleOutcome {
  return { kind: "read", ticket: { standing } };
}

export type Overrides = {
  readReceiptStatus?: () => Promise<ReceiptPrintStatusOutcome>;
  readBackupTicket?: () => Promise<ReadContingencyBackupTicketOfSaleOutcome>;
  readBackupTickets?: () => Promise<ReadContingencyBackupTicketsOutcome>;
  answerReceiptQuestion?: (saleId: string, print: boolean) => Promise<AnswerReceiptQuestionOutcome>;
  mayChangePrinter?: boolean;
};

export async function renderPanel(amounts: Amounts, overrides: Overrides = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const onNewSale = vi.fn();
  const readReceiptStatus = vi.fn(
    overrides.readReceiptStatus ?? (async () => found(null, { printed: true })),
  );
  const readBackupTicket = vi.fn(overrides.readBackupTicket ?? (async () => ticketOf(null)));
  const readBackupTickets = vi.fn(
    overrides.readBackupTickets ??
      (async (): Promise<ReadContingencyBackupTicketsOutcome> => ({
        kind: "read",
        tickets: backupTickets(),
      })),
  );
  const answerReceiptQuestion = vi.fn(
    overrides.answerReceiptQuestion ??
      (async (): Promise<AnswerReceiptQuestionOutcome> => ({ kind: "printing" })),
  );
  const screen = await render(
    <SaleCompletedPanel
      {...amounts}
      saleId="sale-1"
      readReceiptStatus={readReceiptStatus}
      readBackupTicket={readBackupTicket}
      readBackupTickets={readBackupTickets}
      answerReceiptQuestion={answerReceiptQuestion}
      mayChangePrinter={overrides.mayChangePrinter ?? false}
      onNewSale={onNewSale}
    />,
  );
  return {
    screen,
    onNewSale,
    readReceiptStatus,
    readBackupTicket,
    readBackupTickets,
    answerReceiptQuestion,
  };
}

export async function expectAlertText(
  screen: { getByRole: (role: "alert") => { element: () => Element } },
  text: string,
) {
  await expect.poll(() => screen.getByRole("alert").element().textContent).toContain(text);
}

export const CASH = { total: 476_000, tendered: 500_000, change: 24_000, cashRounding: 0 };
