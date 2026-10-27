import { invoiceDeferredSalesUpTo } from "@purosur/domain/fiscal/use-cases";
import type { DeferredSaleInvoicing } from "@purosur/domain/sales/use-cases";
import type { DeferredBacklogSerializer } from "../fiscal/deferred-backlog-serializer";
import {
  type DeferralIdentities,
  deferredSaleCatchUpPorts,
  type RealTimeAuthorizationWiringDeps,
} from "../fiscal/real-time-authorization-wiring";

export function createDeferredSaleInvoicing({
  database,
  readOutboxChainKey,
  serialize,
  ...deps
}: RealTimeAuthorizationWiringDeps & DeferralIdentities & { serialize: DeferredBacklogSerializer }):
  | DeferredSaleInvoicing
  | undefined {
  if (database === undefined) {
    return undefined;
  }
  return {
    invoiceUpTo: (saleId) =>
      serialize(async () => {
        const outboxChainKey = await readOutboxChainKey();
        if (outboxChainKey === undefined) {
          throw new Error("the register has no outbox chain key");
        }
        return invoiceDeferredSalesUpTo(deferredSaleCatchUpPorts(database, outboxChainKey, deps), {
          saleId,
        });
      }),
  };
}
