import type { ReceiptSource } from "../../model/receipt-content.js";
import type { PrinterStatus } from "../../model/receipt-print-standing.js";
import type { ReceiptPrintGrant, ReceiptPrintingPorts } from "../receipt-printing.js";
import { AdjustableClock } from "./adjustable-clock.js";
import { FakeOperationAuthority } from "./fake-operation-authority.js";
import { FakeReceiptLedger, type FakeReceiptSale } from "./fake-receipt-ledger.js";
import { FakeReceiptPrinter } from "./fake-receipt-printer.js";
import { FakeReceiptTemplate } from "./fake-receipt-template.js";
import { SequentialIds } from "./fake-sale-ledger.js";

const SALE_COMPLETED_AT = new Date("2026-10-07T15:00:00.000Z");
export const FIRST_PRINT_AT = new Date("2026-10-07T15:01:00.000Z");
export const ACKNOWLEDGED_AT = new Date("2026-10-07T15:01:03.000Z");
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
  total: 6750,
  lines: [
    {
      productName: "Yerba 1 kg",
      saleUnit: "UNIT",
      quantity: 3,
      listUnitPrice: 2500,
      promotions: [],
      promotionId: null,
      discountAmount: 0,
      lineTotal: 7500,
    },
  ],
  payments: [{ method: "CASH", amount: 7500, tendered: 8000 }],
};

export function completedSale(overrides: Partial<FakeReceiptSale> = {}): FakeReceiptSale {
  return {
    id: "sale-1",
    completed: true,
    source: SOURCE,
    printAttemptedAt: null,
    printedAt: null,
    stored: undefined,
    reprints: [],
    ...overrides,
  };
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
    printer,
    authority,
  };
  return { ledger, clock, template, printer, authority, statuses, watch, ports };
}
