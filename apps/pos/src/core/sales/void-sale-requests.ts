import type { Authorization, AuthorizedBy, VoidSaleOutcome } from "@purosur/contracts";
import {
  type OperationAuthorization,
  type VoidSaleGrant,
  voidSale,
} from "@purosur/domain/sales/use-cases";
import { toWireRefund } from "../payments/wire-refund";
import type { OutboxSaleRequestDeps } from "./sale-requests";
import { SqliteSaleVoidLedger } from "./sqlite-sale-void-ledger";

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

export async function voidSaleFor(
  { database, gate, now, ids, readOutboxChainKey }: OutboxSaleRequestDeps,
  { saleId, pendingRefundsConfirmed, authorization }: VoidSaleRequest,
): Promise<VoidSaleOutcome> {
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
  return outcome.kind === "voided"
    ? {
        kind: "voided",
        refunds: outcome.refunds.map(toWireRefund),
        authorized_by: outcome.grant.authorizer,
      }
    : outcome;
}
