import type {
  Authorization,
  PrintCreditNoteOutcome,
  PrintDeferredSaleInvoiceOutcome,
  PrintOriginalReceiptOutcome,
  ReprintSaleReceiptOutcome,
  SaleHistoryDetailOutcome,
  SalesHistoryOutcome,
  SignInUser,
  VoidSaleOutcome,
} from "@purosur/contracts";
import { onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SalesHistoryQuery } from "../../platform/core-client";
import { BarcodeReadings } from "../../shell/barcode-readings";
import { RegisterWindow } from "../../shell/test-support/register-window";
import { render } from "../../shell/test-support/render-with-router";
import type { SalesHistoryScreenProps } from "../sales-history-screen";
import { SalesHistoryScreen } from "../sales-history-screen";
import { DETAIL } from "./sale-history-detail";

export { DETAIL };

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
  payment_methods: ["CASH"],
  total: 5_070_000,
  state: "completed",
};
export const DEFERRED_ROW: Row = {
  sale_id: "sale-2",
  occurred_at: "2026-10-09T10:20:00.000-03:00",
  comprobante: { kind: "deferred_non_fiscal" },
  payment_methods: ["TRANSFER", "CASH"],
  total: 320_000,
  state: "deferred",
};
const OPEN_ROW: Row = {
  sale_id: "sale-3",
  occurred_at: "2026-10-09T09:37:00.000-03:00",
  comprobante: { kind: "none" },
  payment_methods: [],
  total: 2_130_000,
  state: "in_progress",
};

export function pageOf(rows: Row[], total = rows.length): SalesHistoryOutcome {
  return { kind: "found", rows, total, page_size: 50 };
}

const AUTHORIZERS: SignInUser[] = [{ id: "u2", first_name: "Grace" }];

export type Overrides = Partial<Pick<SalesHistoryScreenProps, "person" | "sessionOpen">> & {
  salesHistory?: (query: SalesHistoryQuery) => Promise<SalesHistoryOutcome>;
  saleHistoryDetail?: (saleId: string) => Promise<SaleHistoryDetailOutcome>;
  reprintSaleReceipt?: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  printOriginalReceipt?: (saleId: string) => Promise<PrintOriginalReceiptOutcome>;
  printCreditNote?: (saleId: string, creditNoteId: string) => Promise<PrintCreditNoteOutcome>;
  reprintCreditNote?: (
    saleId: string,
    creditNoteId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  reprintDeferredSaleInvoice?: (
    saleId: string,
    reason: string,
    authorization: Authorization | undefined,
  ) => Promise<ReprintSaleReceiptOutcome>;
  printDeferredSaleInvoice?: (saleId: string) => Promise<PrintDeferredSaleInvoiceOutcome>;
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
  const printOriginalReceipt = vi.fn(
    overrides.printOriginalReceipt ??
      (async (): Promise<PrintOriginalReceiptOutcome> => ({
        kind: "started",
        copy: { kind: "original" },
      })),
  );
  const printCreditNote = vi.fn(
    overrides.printCreditNote ??
      (async (): Promise<PrintCreditNoteOutcome> => ({
        kind: "started",
        copy: { kind: "original" },
      })),
  );
  const reprintCreditNote = vi.fn(
    overrides.reprintCreditNote ??
      (async (): Promise<ReprintSaleReceiptOutcome> => ({
        kind: "started",
        copy: { kind: "duplicate", order_number: 1 },
      })),
  );
  const reprintDeferredSaleInvoice = vi.fn(
    overrides.reprintDeferredSaleInvoice ??
      (async (): Promise<ReprintSaleReceiptOutcome> => ({
        kind: "started",
        copy: { kind: "duplicate", order_number: 1 },
      })),
  );
  const printDeferredSaleInvoice = vi.fn(
    overrides.printDeferredSaleInvoice ??
      (async (): Promise<PrintDeferredSaleInvoiceOutcome> => ({
        kind: "started",
        copy: { kind: "original" },
      })),
  );
  const lock = vi.fn();
  const onSessionInvalid = vi.fn();
  const readers = new Set<(code: string) => void>();
  const screen = await render(
    <BarcodeReadings
      onBarcodeRead={(listener) => {
        readers.add(listener);
        return () => {
          readers.delete(listener);
        };
      }}
    >
      <RegisterWindow>
        <SalesHistoryScreen
          person={person}
          sessionOpen={sessionOpen}
          lock={lock}
          salesHistory={salesHistory}
          saleHistoryDetail={saleHistoryDetail}
          reprintSaleReceipt={reprintSaleReceipt}
          printOriginalReceipt={printOriginalReceipt}
          voidSale={voidSale}
          printCreditNote={printCreditNote}
          reprintCreditNote={reprintCreditNote}
          reprintDeferredSaleInvoice={reprintDeferredSaleInvoice}
          printDeferredSaleInvoice={printDeferredSaleInvoice}
          loadAuthorizers={async () => AUTHORIZERS}
          onSessionInvalid={onSessionInvalid}
        />
      </RegisterWindow>
    </BarcodeReadings>,
  );
  return {
    readBarcode(code: string) {
      for (const listener of readers) listener(code);
    },
    screen,
    salesHistory,
    saleHistoryDetail,
    reprintSaleReceipt,
    printOriginalReceipt,
    voidSale,
    printCreditNote,
    reprintCreditNote,
    reprintDeferredSaleInvoice,
    printDeferredSaleInvoice,
    lock,
    onSessionInvalid,
  };
}

export type Screen = Awaited<ReturnType<typeof renderScreen>>["screen"];

export function table(screen: Screen) {
  return screen.getByRole("table", { name: "Ventas" });
}

export async function chooseSale(screen: Screen, time: string) {
  await userEvent.click(table(screen).getByText(time, { exact: true }));
}

export function legendOf(screen: Screen): string[] {
  return screen
    .getByRole("listitem")
    .elements()
    .filter((item) => item.querySelector("kbd") !== null && item.closest("table") === null)
    .map((item) => item.textContent.trim());
}

export function searchField(screen: Screen) {
  return screen.getByRole("searchbox", { name: "Escaneá el ticket o escribí el número" });
}

export function detailPanel(screen: Screen) {
  return screen.getByRole("complementary", { name: "Detalle de la venta" });
}
