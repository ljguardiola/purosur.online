import type {
  Authorization,
  AuthorizationRefusal,
  AuthorizedBy,
  CompleteReturnOutcome,
  FindSaleForReturnOutcome,
  PreviewReturnOutcome,
} from "@purosur/contracts";
import type { RefundAllocation, ReturnDraftLine, TicketSource } from "@purosur/domain";
import {
  type CloudCreditNotes,
  type ReturnCreditNoteToRequest,
  type ReturnedSaleInvoicing,
  requestReturnCreditNote,
} from "@purosur/domain/fiscal/use-cases";
import {
  type CompleteReturnGrant,
  completeReturn,
  findSaleForReturn,
  type OperationAuthorization,
  previewReturn,
  type SaleReturnSearch,
} from "@purosur/domain/returns/use-cases";
import type { DeferredSaleInvoicing } from "@purosur/domain/sales/use-cases";
import { SqliteSaleCreditNotes } from "../fiscal/sqlite-sale-credit-notes";
import type { OutboxSaleRequestDeps } from "../sales/sale-requests";
import {
  toWireLineRefusal,
  toWirePreviewedLines,
  toWireRefundRefusal,
  toWireSaleForReturn,
} from "./returns-wire";
import { SqliteReturnLedger } from "./sqlite-return-ledger";
import { SqliteReturnSaleReader } from "./sqlite-return-sale-reader";

export type ReturnRequestDeps = Pick<
  OutboxSaleRequestDeps,
  "database" | "gate" | "now" | "zoneRules" | "ids" | "readOutboxChainKey"
> & {
  creditNotes?: CloudCreditNotes | undefined;
  invoicing?: DeferredSaleInvoicing | undefined;
  printCreditNote?:
    | ((creditNote: { saleId: string; creditNoteId: string }) => Promise<void>)
    | undefined;
  reportFailure?: ((error: unknown) => void) | undefined;
};

const NO_ANSWER_FROM_CLOUD: CloudCreditNotes = { request: async () => null };
const NO_INVOICING: ReturnedSaleInvoicing = {
  invoiceUpTo: async () => ({ kind: "not_yet", cause: "cannot_authorize" }),
};

async function settleCreditNote(
  { database, now, creditNotes, invoicing, printCreditNote, reportFailure }: ReturnRequestDeps,
  saleId: string,
  creditNote: ReturnCreditNoteToRequest,
): Promise<void> {
  const report = reportFailure ?? (() => undefined);
  const outcome = await requestReturnCreditNote(
    {
      creditNotes: new SqliteSaleCreditNotes(database),
      cloud: creditNotes ?? NO_ANSWER_FROM_CLOUD,
      clock: { now },
      printer: {
        startPrinting: (printed) => void printCreditNote?.(printed).catch(report),
      },
      invoicing: invoicing ?? NO_INVOICING,
    },
    { saleId, creditNote },
  );
  if (outcome.invoicing.kind === "failed") {
    report(outcome.invoicing.error);
  }
  if (outcome.creditNote.kind === "failed") {
    report(outcome.creditNote.error);
  }
}

export interface FindSaleForReturnRequest {
  ticket: SaleReturnSearch;
  authorization?: Authorization | undefined;
}

export interface PreviewReturnRequest {
  saleId: string;
  lines: readonly ReturnDraftLine[];
}

export interface CompleteReturnRequest {
  saleId: string;
  ticketSource: TicketSource;
  lines: readonly ReturnDraftLine[];
  refunds: readonly RefundAllocation[];
  authorization?: Authorization | undefined;
}

type ReturnRefusal =
  | { kind: "not_signed_in" }
  | { kind: "lacks_permission" }
  | AuthorizationRefusal;

interface ReturnRequestGrant extends CompleteReturnGrant {
  authorizer: AuthorizedBy | null;
}

export async function findSaleForReturnFor(
  { database, gate, now, zoneRules }: ReturnRequestDeps,
  { ticket, authorization }: FindSaleForReturnRequest,
): Promise<FindSaleForReturnOutcome> {
  const guarded = await gate.runAuthorized({ kind: "process_return" }, authorization, async () =>
    findSaleForReturn(
      { zoneRules, reader: new SqliteReturnSaleReader(database), clock: { now } },
      ticket,
    ),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { result } = guarded;
  return result.kind === "found"
    ? { kind: "found", sale: toWireSaleForReturn(result.sale, zoneRules.zoneRules()) }
    : result;
}

export async function previewReturnFor(
  { database, gate, now, zoneRules }: ReturnRequestDeps,
  request: PreviewReturnRequest,
): Promise<PreviewReturnOutcome> {
  const guarded = await gate.run({ kind: "preview_return" }, async () =>
    previewReturn(
      { zoneRules, reader: new SqliteReturnSaleReader(database), clock: { now } },
      request,
    ),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { result } = guarded;
  return result.kind === "previewed"
    ? {
        kind: "previewed",
        lines: toWirePreviewedLines(result.lines),
        refundable_total: result.refundableTotal,
      }
    : result;
}

export async function completeReturnFor(
  deps: ReturnRequestDeps,
  { saleId, ticketSource, lines, refunds, authorization }: CompleteReturnRequest,
): Promise<CompleteReturnOutcome> {
  const { database, gate, now, zoneRules, ids, readOutboxChainKey } = deps;
  const outboxChainKey = await readOutboxChainKey();
  const outcome = await completeReturn<ReturnRequestGrant, ReturnRefusal>(
    {
      zoneRules,
      ledger: new SqliteReturnLedger(database, outboxChainKey),
      clock: { now },
      ids,
      authority: {
        async authorize(): Promise<OperationAuthorization<ReturnRequestGrant, ReturnRefusal>> {
          const guarded = await gate.runAuthorized(
            { kind: "process_return" },
            authorization,
            async (actor) => actor,
          );
          return guarded.kind === "performed"
            ? {
                kind: "granted",
                grant: {
                  actorId: guarded.result.signedInUserId,
                  authorizedBy: guarded.authorized_by?.user_id,
                  authorizer: guarded.authorized_by,
                },
              }
            : { kind: "refused", refusal: guarded };
        },
      },
    },
    { saleId, ticketSource, lines, refunds },
  );
  if (outcome.kind === "completed" && outcome.creditNote.kind !== "none") {
    await settleCreditNote(deps, saleId, outcome.creditNote);
  }
  switch (outcome.kind) {
    case "completed":
      return {
        kind: "completed",
        return_id: outcome.returnId,
        refunded_total: outcome.refundedTotal,
        refunds: outcome.refunds.map(({ paymentId, method, amount, state }) => ({
          payment_id: paymentId,
          method,
          amount,
          state,
        })),
        authorized_by: outcome.grant.authorizer,
      };
    case "line_refused":
      return {
        kind: "line_refused",
        sale_line_id: outcome.saleLineId,
        refusal: toWireLineRefusal(outcome.refusal),
      };
    case "refund_refused":
      return { kind: "refund_refused", refusal: toWireRefundRefusal(outcome.refusal) };
    default:
      return outcome;
  }
}
