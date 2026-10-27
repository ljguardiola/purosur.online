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
  type CompleteReturnGrant,
  completeReturn,
  findSaleForReturn,
  type OperationAuthorization,
  previewReturn,
  type SaleReturnSearch,
} from "@purosur/domain/returns/use-cases";
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
  "database" | "gate" | "now" | "ids" | "readOutboxChainKey"
>;

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
  { database, gate, now }: ReturnRequestDeps,
  { ticket, authorization }: FindSaleForReturnRequest,
): Promise<FindSaleForReturnOutcome> {
  const guarded = await gate.runAuthorized({ kind: "process_return" }, authorization, async () =>
    findSaleForReturn({ reader: new SqliteReturnSaleReader(database), clock: { now } }, ticket),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { result } = guarded;
  return result.kind === "found"
    ? { kind: "found", sale: toWireSaleForReturn(result.sale) }
    : result;
}

export async function previewReturnFor(
  { database, gate, now }: ReturnRequestDeps,
  request: PreviewReturnRequest,
): Promise<PreviewReturnOutcome> {
  const guarded = await gate.run({ kind: "preview_return" }, async () =>
    previewReturn({ reader: new SqliteReturnSaleReader(database), clock: { now } }, request),
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
  { database, gate, now, ids, readOutboxChainKey }: ReturnRequestDeps,
  { saleId, ticketSource, lines, refunds, authorization }: CompleteReturnRequest,
): Promise<CompleteReturnOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  const outcome = await completeReturn<ReturnRequestGrant, ReturnRefusal>(
    {
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
