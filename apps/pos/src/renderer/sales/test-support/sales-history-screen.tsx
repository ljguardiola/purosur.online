import type {
  Authorization,
  PrintCreditNoteOutcome,
  ReprintSaleReceiptOutcome,
  SaleHistoryDetailOutcome,
  SalesHistoryOutcome,
  SignInUser,
  VoidSaleOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SalesHistoryQuery } from "../../platform/core-client";
import type { SaleDetail } from "../../shell/sale-receipt-text";
import { render } from "../../shell/test-support/render-with-router";
import type { SalesHistoryScreenProps } from "../sales-history-screen";
import { SalesHistoryScreen } from "../sales-history-screen";

type Found = Extract<SalesHistoryOutcome, { kind: "found" }>;
type Row = Found["rows"][number];

const PERSON: SalesHistoryScreenProps["person"] = {
  user_id: "u1",
  first_name: "Tomás",
  abilities: ["view_sales_history", "reprint_receipt"],
};

export const FISCAL_ROW: Row = {
  sale_id: "sale-1",
  occurred_at: "2026-10-09T11:42:00.000-03:00",
  comprobante: {
    kind: "fiscal",
    document_type: "factura_c",
    authorization: "real_time",
    point_of_sale: 3,
    number: 1248,
  },
  operation_number: 482,
  payment_methods: ["CASH"],
  total: 5_070_000,
  state: "completed",
};
export const DEFERRED_ROW: Row = {
  sale_id: "sale-2",
  occurred_at: "2026-10-09T10:20:00.000-03:00",
  comprobante: { kind: "deferred_non_fiscal" },
  operation_number: 481,
  payment_methods: ["TRANSFER", "CASH"],
  total: 320_000,
  state: "deferred",
};
const OPEN_ROW: Row = {
  sale_id: "sale-3",
  occurred_at: "2026-10-09T09:37:00.000-03:00",
  comprobante: { kind: "none" },
  operation_number: 480,
  payment_methods: [],
  total: 2_130_000,
  state: "in_progress",
};

export function pageOf(rows: Row[], total = rows.length): SalesHistoryOutcome {
  return { kind: "found", rows, total, page_size: 50 };
}

export const DETAIL: SaleDetail = {
  sale_id: "sale-1",
  occurred_at: "2026-10-09T11:42:00.000-03:00",
  total: 5_070_000,
  comprobante: {
    kind: "fiscal",
    document_type: "factura_c",
    authorization: "real_time",
    point_of_sale: 3,
    number: 1248,
  },
  operation_number: 482,
  served_by_first_name: "Tomás",
  line_count: 8,
  payments: [{ method: "CASH", amount: 5_070_000 }],
  state: "completed",
  voidability: {
    kind: "voidable",
    refunds: [{ method: "CASH", amount: 5_070_000, state: "APPROVED", sent_by_cloud: false }],
    credit_note_corrects: { point_of_sale: 3, number: 1248 },
  },
  void_authorization_required: false,
  reprint: { kind: "available" },
  next_copy: { kind: "duplicate", order_number: 1 },
  credit_note: null,
};

const AUTHORIZERS: SignInUser[] = [{ id: "u2", first_name: "Grace" }];

export type Overrides = Partial<Pick<SalesHistoryScreenProps, "person" | "sessionOpen">> & {
  salesHistory?: (query: SalesHistoryQuery) => Promise<SalesHistoryOutcome>;
  saleHistoryDetail?: (saleId: string) => Promise<SaleHistoryDetailOutcome>;
  reprintSaleReceipt?: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  printCreditNote?: (saleId: string) => Promise<PrintCreditNoteOutcome>;
  voidSale?: (
    saleId: string,
    pendingRefundsConfirmed: boolean,
    authorization: Authorization | undefined,
  ) => Promise<VoidSaleOutcome>;
};

export async function renderScreen({
  person = PERSON,
  sessionOpen = true,
  ...overrides
}: Overrides = {}) {
  await page.viewport(1280, 1000);
  onTestFinished(() => page.viewport(414, 896));
  const salesHistory = vi.fn(
    overrides.salesHistory ?? (async () => pageOf([FISCAL_ROW, DEFERRED_ROW, OPEN_ROW])),
  );
  const saleHistoryDetail = vi.fn(
    overrides.saleHistoryDetail ??
      (async (): Promise<SaleHistoryDetailOutcome> => ({ kind: "found", detail: DETAIL })),
  );
  const reprintSaleReceipt = vi.fn(
    overrides.reprintSaleReceipt ??
      (async (): Promise<ReprintSaleReceiptOutcome> => ({
        kind: "started",
        copy: { kind: "duplicate", order_number: 1 },
      })),
  );
  const voidSale = vi.fn(
    overrides.voidSale ??
      (async (): Promise<VoidSaleOutcome> => ({
        kind: "voided",
        refunds: [],
        authorized_by: null,
        credit_note: null,
      })),
  );
  const printCreditNote = vi.fn(
    overrides.printCreditNote ??
      (async (): Promise<PrintCreditNoteOutcome> => ({ kind: "started" })),
  );
  const lock = vi.fn();
  const onSessionInvalid = vi.fn();
  const screen = await render(
    <SalesHistoryScreen
      person={person}
      registerName="Caja 1"
      sessionOpen={sessionOpen}
      lock={lock}
      salesHistory={salesHistory}
      saleHistoryDetail={saleHistoryDetail}
      reprintSaleReceipt={reprintSaleReceipt}
      voidSale={voidSale}
      printCreditNote={printCreditNote}
      loadAuthorizers={async () => AUTHORIZERS}
      onSessionInvalid={onSessionInvalid}
    />,
  );
  return {
    screen,
    salesHistory,
    saleHistoryDetail,
    reprintSaleReceipt,
    voidSale,
    printCreditNote,
    lock,
    onSessionInvalid,
  };
}

export type Screen = Awaited<ReturnType<typeof renderScreen>>["screen"];

export function table(screen: Screen) {
  return screen.getByRole("table", { name: "Ventas" });
}

export async function chooseSale(screen: Screen, time: string) {
  await userEvent.click(screen.getByRole("button", { name: `Ver la venta de las ${time}` }));
}
