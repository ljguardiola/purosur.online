import type { PrintCreditNoteOutcome, ReprintSaleReceiptOutcome } from "@purosur/contracts";
import type {
  OperationAuthority,
  OperationAuthorization,
  ReceiptPrintGrant,
} from "@purosur/domain/sales/use-cases";
import { readCreditNoteOfSale } from "../fiscal/sqlite-void-credit-notes";
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

interface IssuedCreditNote {
  saleId: string;
  creditNoteId: string;
}

function keyOf({ saleId, creditNoteId }: IssuedCreditNote) {
  return { document: "credit_note", saleId, creditNoteId } as const;
}

function creditNoteOfVoidedSale(
  { database }: ReceiptRequestDeps,
  saleId: string,
): IssuedCreditNote | undefined {
  const creditNote = readCreditNoteOfSale(database, saleId);
  return creditNote === null ? undefined : { saleId, creditNoteId: creditNote.creditNoteId };
}

export async function printCreditNoteFor(
  deps: ReceiptRequestDeps,
  saleId: string,
): Promise<PrintCreditNoteOutcome> {
  const creditNote = creditNoteOfVoidedSale(deps, saleId);
  if (creditNote === undefined) {
    return { kind: "not_found" };
  }
  return printOriginalFor(
    deps,
    keyOf(creditNote),
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
  const creditNote = creditNoteOfVoidedSale(deps, saleId);
  if (creditNote === undefined) {
    return { kind: "not_found" };
  }
  return reprintFor(deps, keyOf(creditNote), request);
}

export async function printVoidedSaleCreditNoteFor(
  deps: ReceiptRequestDeps,
  creditNote: IssuedCreditNote,
): Promise<void> {
  await printOriginalFor(
    deps,
    keyOf(creditNote),
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
