import type { OperationAuthorization } from "../../shared/index.js";
import type { DeferredSaleFacts } from "../model/deferred-sale-lookup.js";
import { deferredSaleAvailability } from "../model/deferred-sale-lookup.js";
import type {
  DeferredSaleInvoicing,
  DeferredSaleInvoicingOutcome,
  DeferredSaleLookup,
} from "./deferred-sale-lookup-ports.js";
import type { ReceiptPrintWatch } from "./receipt-ports.js";
import {
  type OriginalReceiptPrintOutcome,
  printOriginalOnly,
  type ReceiptPrintGrant,
  type ReceiptPrintingPorts,
} from "./receipt-printing.js";

export interface PrintDeferredSaleInvoiceInput {
  saleId: string;
}

export type PrintDeferredSaleInvoicePorts<
  Grant extends ReceiptPrintGrant,
  Refusal,
> = ReceiptPrintingPorts<Grant, Refusal> & {
  lookup: DeferredSaleLookup;
  invoicing: DeferredSaleInvoicing;
};

export type PrintDeferredSaleInvoiceOutcome =
  | Exclude<OriginalReceiptPrintOutcome, { kind: "already_attempted" }>
  | { kind: "already_printed" }
  | { kind: "voided" }
  | { kind: "expired" }
  | Extract<DeferredSaleInvoicingOutcome, { kind: "not_yet" }>;

export async function printDeferredSaleInvoice<Grant extends ReceiptPrintGrant, Refusal>(
  ports: PrintDeferredSaleInvoicePorts<Grant, Refusal>,
  { saleId }: PrintDeferredSaleInvoiceInput,
  watch: ReceiptPrintWatch,
): Promise<PrintDeferredSaleInvoiceOutcome | Refusal> {
  const authorization = await ports.authority.authorize();
  if (authorization.kind === "refused") {
    return authorization.refusal;
  }
  const authorized: ReceiptPrintingPorts<Grant, never> = {
    ...ports,
    authority: {
      authorize: async (): Promise<OperationAuthorization<Grant, never>> => authorization,
    },
  };

  const facts = ports.lookup.find({ kind: "sale", saleId });
  const unavailable = unavailableOutcome(facts, ports.clock.now());
  if (unavailable !== undefined) {
    return unavailable;
  }
  if (facts?.invoice.kind === "pending") {
    const invoicing = await ports.invoicing.invoiceUpTo(saleId);
    if (invoicing.kind === "not_yet") {
      return invoicing;
    }
    const reread = ports.lookup.find({ kind: "sale", saleId });
    const gone = unavailableOutcome(reread, ports.clock.now());
    if (gone !== undefined) {
      return gone;
    }
    if (reread?.invoice.kind !== "issued") {
      return { kind: "expired" };
    }
  }
  const printed = await printOriginalOnly(
    authorized,
    { document: "deferred_invoice", saleId },
    watch,
  );
  return printed.kind === "already_attempted" ? { kind: "already_printed" } : printed;
}

type UnavailableOutcome = Extract<
  PrintDeferredSaleInvoiceOutcome,
  { kind: "not_found" | "voided" | "expired" }
>;

function unavailableOutcome(
  facts: DeferredSaleFacts | null,
  now: Date,
): UnavailableOutcome | undefined {
  if (facts === null) {
    return { kind: "not_found" };
  }
  const availability = deferredSaleAvailability(facts, now);
  return availability === "available" ? undefined : { kind: availability };
}
