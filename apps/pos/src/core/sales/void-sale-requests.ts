import type { Authorization, AuthorizedBy, VoidSaleOutcome } from "@purosur/contracts";
import type { VoidCreditNoteStanding } from "@purosur/domain";
import {
  type CloudCreditNotes,
  type PendingCreditNote,
  type RegisterVoidCreditNotes,
  requestVoidCreditNotes,
} from "@purosur/domain/fiscal/use-cases";
import {
  type OperationAuthorization,
  type VoidSaleGrant,
  voidSale,
} from "@purosur/domain/sales/use-cases";
import { SqliteVoidCreditNotes } from "../fiscal/sqlite-void-credit-notes";
import { toWireCreditNote } from "../fiscal/wire-credit-note";
import { toWireRefund } from "../payments/wire-refund";
import type { OutboxSaleRequestDeps } from "./sale-requests";
import { SqliteSaleVoidLedger } from "./sqlite-sale-void-ledger";

export interface VoidSaleRequestDeps extends OutboxSaleRequestDeps {
  creditNotes: CloudCreditNotes | undefined;
  printCreditNote: (saleId: string) => Promise<void>;
  reportFailure: (error: unknown) => void;
}

export interface VoidSaleRequest {
  saleId: string;
  pendingRefundsConfirmed: boolean;
  authorization?: Authorization | undefined;
}

interface VoidSaleRequestGrant extends VoidSaleGrant {
  authorizer: AuthorizedBy | null;
}

type VoidSaleRefusal = Extract<
  VoidSaleOutcome,
  {
    kind:
      | "not_signed_in"
      | "lacks_permission"
      | "wrong_pin"
      | "rate_limited"
      | "locked"
      | "unavailable";
  }
>;

const IN_PROGRESS: VoidCreditNoteStanding = { kind: "in_progress" };

const NO_ANSWER_FROM_CLOUD: CloudCreditNotes = { request: async () => null };

function onlyCreditNote(
  creditNotes: RegisterVoidCreditNotes,
  creditNoteId: string,
): RegisterVoidCreditNotes {
  return {
    inProgress: async (): Promise<PendingCreditNote[]> =>
      (await creditNotes.inProgress()).filter((pending) => pending.creditNoteId === creditNoteId),
    realTimePointOfSale: () => creditNotes.realTimePointOfSale(),
    recordAnswer: (id, answer, answeredAt) => creditNotes.recordAnswer(id, answer, answeredAt),
  };
}

async function answerOfCreditNote(
  { database, now, creditNotes, printCreditNote, reportFailure }: VoidSaleRequestDeps,
  saleId: string,
  creditNoteId: string,
): Promise<VoidCreditNoteStanding> {
  try {
    const { answers } = await requestVoidCreditNotes({
      creditNotes: onlyCreditNote(new SqliteVoidCreditNotes(database), creditNoteId),
      cloud: creditNotes ?? NO_ANSWER_FROM_CLOUD,
      clock: { now },
    });
    const answer = answers[0]?.answer ?? IN_PROGRESS;
    if (answer.kind === "authorized") {
      printCreditNote(saleId).catch(reportFailure);
    }
    return answer;
  } catch (error) {
    reportFailure(error);
    return IN_PROGRESS;
  }
}

export async function voidSaleFor(
  deps: VoidSaleRequestDeps,
  { saleId, pendingRefundsConfirmed, authorization }: VoidSaleRequest,
): Promise<VoidSaleOutcome> {
  const { database, gate, now, ids, readOutboxChainKey } = deps;
  const outboxChainKey = await readOutboxChainKey();
  const outcome = await voidSale<VoidSaleRequestGrant, VoidSaleRefusal>(
    {
      ledger: new SqliteSaleVoidLedger(database, outboxChainKey),
      clock: { now },
      ids,
      authority: {
        async authorize(): Promise<OperationAuthorization<VoidSaleRequestGrant, VoidSaleRefusal>> {
          const guarded = await gate.runAuthorized(
            { kind: "void_sale" },
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
    { saleId, pendingRefundsConfirmed },
  );
  if (outcome.kind !== "voided") {
    return outcome;
  }
  return {
    kind: "voided",
    refunds: outcome.refunds.map(toWireRefund),
    authorized_by: outcome.grant.authorizer,
    credit_note:
      outcome.creditNote === null
        ? null
        : toWireCreditNote(
            await answerOfCreditNote(
              deps,
              outcome.creditNote.saleId,
              outcome.creditNote.creditNoteId,
            ),
          ),
  };
}
