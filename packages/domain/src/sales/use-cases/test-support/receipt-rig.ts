import type { CreditNoteReceiptContent } from "../../model/credit-note-receipt-content.js";
import type { ReceiptSource } from "../../model/receipt-content.js";
import type { PrinterStatus } from "../../model/receipt-print-standing.js";
import type { ReceiptPrintGrant, ReceiptPrintingPorts } from "../receipt-printing.js";
import { AdjustableClock } from "./adjustable-clock.js";
import { FakeOperationAuthority } from "./fake-operation-authority.js";
import {
  type FakeCreditNote,
  FakeReceiptLedger,
  type FakeReceiptSale,
} from "./fake-receipt-ledger.js";
import { FakeReceiptPrinter } from "./fake-receipt-printer.js";
import { FakeReceiptPrinters } from "./fake-receipt-printers.js";
import { FakeReceiptTemplate } from "./fake-receipt-template.js";
import { SequentialIds } from "./fake-sale-ledger.js";

const SALE_COMPLETED_AT = new Date("2026-10-07T15:00:00.000Z");
export const FIRST_PRINT_AT = new Date("2026-10-07T15:01:00.000Z");
export const SENT_AT = new Date("2026-10-07T15:01:03.000Z");
const OWN_GRANT: ReceiptPrintGrant = { actorId: "cashier", authorizedBy: undefined };
export const AUTHORIZED_GRANT: ReceiptPrintGrant = {
  actorId: "cashier",
  authorizedBy: "supervisor",
};
export const NOT_PERMITTED = { kind: "not_permitted" } as const;

const SOURCE: ReceiptSource = {
  header: {
    address: "Av. Siempreviva 742",
    whatsappNumber: "+54 9 11 5555-0100",
    instagramHandle: "@purosur",
  },
  occurredAt: SALE_COMPLETED_AT,
  servedByFirstName: "Marta",
  operationNumber: 482,
  total: 6750,
  saleDiscount: null,
  lines: [
    {
      productName: "Yerba 1 kg",
      saleUnit: "UNIT",
      quantity: 3,
      listUnitPrice: 2500,
      promotions: [],
      promotionId: null,
      manualAdjustment: null,
      discountAmount: 0,
      lineTotal: 7500,
    },
  ],
  payments: [{ method: "CASH", amount: 7500, tendered: 8000 }],
  fiscal: { kind: "none" },
};

export function completedSale(overrides: Partial<FakeReceiptSale> = {}): FakeReceiptSale {
  return {
    id: "sale-1",
    completed: true,
    voided: false,
    source: SOURCE,
    printAttemptedAt: null,
    printedAt: null,
    stored: undefined,
    reprints: [],
    ...overrides,
  };
}

export function voidedSale(overrides: Partial<FakeReceiptSale> = {}): FakeReceiptSale {
  return completedSale({ completed: false, voided: true, ...overrides });
}

export function creditNoteContent(
  issuer: CreditNoteReceiptContent["fiscal"]["issuer"],
): CreditNoteReceiptContent {
  return {
    header: SOURCE.header,
    operation: {
      occurredAt: new Date("2026-10-07T16:00:00.000Z"),
      servedByFirstName: "Marta",
      operationNumber: 482,
    },
    issuedOn: "2026-10-07",
    lines: [],
    totals: { subtotal: 7500, saleDiscount: null, total: 7500 },
    refunds: [{ method: "CASH", amount: 7500 }],
    fiscal: {
      invoiceClass: "C",
      voucherTypeCode: 13,
      issuer,
      buyerTaxStatusDescription: "Consumidor Final",
      pointOfSale: 3,
      number: 9,
      authorizationCode: "71234567890999",
      authorizationCodeDueOn: "2026-10-17",
      qrText: "https://example.test/qr",
      corrects: { voucherType: 11, pointOfSale: 3, number: 1204 },
    },
  };
}

function creditNote(
  overrides: Partial<FakeCreditNote> & Pick<FakeCreditNote, "content">,
): FakeCreditNote {
  return {
    authorized: true,
    printAttemptedAt: null,
    printedAt: null,
    stored: undefined,
    reprints: [],
    ...overrides,
  };
}

export function creditedSale(
  overrides: Partial<FakeCreditNote> & Pick<FakeCreditNote, "content">,
  sale: Partial<FakeReceiptSale> = {},
): FakeReceiptSale {
  return voidedSale({ creditNote: creditNote(overrides), ...sale });
}

export function receiptRig(
  sales: FakeReceiptSale[] = [completedSale()],
  authority = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
    kind: "granted",
    grant: OWN_GRANT,
  }),
) {
  const ledger = new FakeReceiptLedger({ sales });
  const clock = new AdjustableClock(FIRST_PRINT_AT);
  const template = new FakeReceiptTemplate();
  const printer = new FakeReceiptPrinter(ledger);
  const printers = new FakeReceiptPrinters(printer);
  const statuses: PrinterStatus[] = [];
  const watch = {
    onStatus: (status: PrinterStatus) => statuses.push(status),
    signal: new AbortController().signal,
  };
  const ports: ReceiptPrintingPorts<ReceiptPrintGrant, typeof NOT_PERMITTED> = {
    ledger,
    clock,
    ids: new SequentialIds(),
    template,
    printers,
    authority,
  };
  return { ledger, clock, template, printer, printers, authority, statuses, watch, ports };
}
