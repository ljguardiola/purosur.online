import type {
  FindDeferredSaleOutcome,
  PrintDeferredSaleInvoiceOutcome,
  ReprintSaleReceiptOutcome,
} from "@purosur/contracts";
import {
  type DeferredSaleInvoicing,
  type FindDeferredSaleInput,
  findDeferredSale,
  printDeferredSaleInvoice,
} from "@purosur/domain/sales/use-cases";
import {
  type ReceiptRequestDeps,
  type ReprintSaleReceiptRequest,
  reprintFor,
  signedSellerAuthority,
  startOriginalPrint,
} from "./receipt-requests";
import { inArgentinaTime } from "../platform/argentina-time";
import { SqliteDeferredSaleLookup } from "./sqlite-deferred-sale-lookup";

export type FindDeferredSaleReading = FindDeferredSaleInput;

export interface DeferredSaleInvoiceRequestDeps extends ReceiptRequestDeps {
  invoicing: DeferredSaleInvoicing;
}

export async function findDeferredSaleFor(
  deps: ReceiptRequestDeps,
  reading: FindDeferredSaleReading,
): Promise<FindDeferredSaleOutcome> {
  const guarded = await deps.gate.run({ kind: "sell" }, async () =>
    findDeferredSale(
      {
        zoneRules: deps.zoneRules,
        lookup: new SqliteDeferredSaleLookup(deps.database),
        clock: { now: deps.now },
      },
      reading,
    ),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { result } = guarded;
  return result.kind === "found"
    ? {
        kind: "found",
        sale_id: result.saleId,
        occurred_at: inArgentinaTime(result.occurredAt, deps.zoneRules.zoneRules()),
        total: result.total,
        short_code: result.shortCode,
        invoice:
          result.invoice.kind === "pending"
            ? result.invoice
            : {
                kind: "issued",
                point_of_sale: result.invoice.pointOfSale,
                number: result.invoice.number,
              },
        original_printed: result.originalPrinted,
      }
    : result;
}

export async function printDeferredSaleInvoiceFor(
  deps: DeferredSaleInvoiceRequestDeps,
  saleId: string,
): Promise<PrintDeferredSaleInvoiceOutcome> {
  const lookup = new SqliteDeferredSaleLookup(deps.database);
  return startOriginalPrint(
    deps,
    { document: "deferred_invoice", saleId },
    (onGrant) => signedSellerAuthority(deps, onGrant),
    (ports, watch) =>
      printDeferredSaleInvoice(
        { zoneRules: deps.zoneRules, ...ports, lookup, invoicing: deps.invoicing },
        { saleId },
        watch,
      ),
  );
}

export async function reprintDeferredSaleInvoiceFor(
  deps: ReceiptRequestDeps,
  { saleId, ...request }: ReprintSaleReceiptRequest,
): Promise<ReprintSaleReceiptOutcome> {
  return reprintFor(deps, { document: "deferred_invoice", saleId }, request);
}
