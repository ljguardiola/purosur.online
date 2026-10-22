import type { PrintCreditNoteOutcome, ReprintSaleReceiptOutcome } from "@purosur/contracts";
import type {
  OperationAuthority,
  OperationAuthorization,
  ReceiptPrintGrant,
} from "@purosur/domain/sales/use-cases";
import {
  printOriginalFor,
  type ReceiptRequestDeps,
  type ReprintSaleReceiptRequest,
  reprintFor,
} from "./receipt-requests";

type HistoryRefusal = Extract<
  PrintCreditNoteOutcome,
  { kind: "not_signed_in" | "lacks_permission" | "unavailable" }
>;

type NotSignedIn = Extract<ReprintSaleReceiptOutcome, { kind: "not_signed_in" }>;

function creditNoteOf(saleId: string) {
  return { document: "credit_note", saleId } as const;
}

export async function printCreditNoteFor(
  deps: ReceiptRequestDeps,
  saleId: string,
): Promise<PrintCreditNoteOutcome> {
  return printOriginalFor(
    deps,
    creditNoteOf(saleId),
    (onGrant): OperationAuthority<ReceiptPrintGrant, HistoryRefusal> => ({
      async authorize(): Promise<OperationAuthorization<ReceiptPrintGrant, HistoryRefusal>> {
        const guarded = await deps.gate.run({ kind: "view_sales_history" }, async (actor) => actor);
        if (guarded.kind !== "performed") {
          return { kind: "refused", refusal: guarded };
        }
        onGrant();
        return {
          kind: "granted",
          grant: { actorId: guarded.result.signedInUserId, authorizedBy: undefined },
        };
      },
    }),
  );
}

export async function reprintCreditNoteFor(
  deps: ReceiptRequestDeps,
  { saleId, ...request }: ReprintSaleReceiptRequest,
): Promise<ReprintSaleReceiptOutcome> {
  return reprintFor(deps, creditNoteOf(saleId), request);
}

export async function printVoidedSaleCreditNoteFor(
  deps: ReceiptRequestDeps,
  saleId: string,
): Promise<void> {
  await printOriginalFor(
    deps,
    creditNoteOf(saleId),
    (onGrant): OperationAuthority<ReceiptPrintGrant, NotSignedIn> => ({
      async authorize(): Promise<OperationAuthorization<ReceiptPrintGrant, NotSignedIn>> {
        const actorId = deps.signedInUserId();
        if (actorId === undefined) {
          return { kind: "refused", refusal: { kind: "not_signed_in" } };
        }
        onGrant();
        return { kind: "granted", grant: { actorId, authorizedBy: undefined } };
      },
    }),
    { unattended: true },
  );
}
