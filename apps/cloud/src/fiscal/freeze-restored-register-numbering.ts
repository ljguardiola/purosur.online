import { restorationNumberingFreeze } from "@purosur/domain";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PendingChanges } from "../sync/change-log.js";
import { takeRegisterRealTimeNumberingLane } from "./drizzle-register-numbering.js";
import type { EnqueueNumberingReconciliation } from "./enqueue-numbering-conflict.js";
import { freezePointOfSaleNumbering } from "./freeze-point-of-sale-numbering.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export async function freezeRestoredRegisterNumbering<TQueryResult extends PgQueryResultHKT>(
  tx: Transaction<TQueryResult>,
  pending: PendingChanges,
  {
    registerId,
    restoredAt,
    enqueueReconciliation,
  }: {
    registerId: string;
    restoredAt: Date;
    enqueueReconciliation: EnqueueNumberingReconciliation;
  },
): Promise<void> {
  const lane = await takeRegisterRealTimeNumberingLane(tx, registerId);
  const freeze = lane && restorationNumberingFreeze(lane.heldCount, restoredAt);
  if (lane && freeze) {
    await freezePointOfSaleNumbering(tx, pending, {
      pointOfSale: lane.pointOfSale,
      freeze,
      enqueueReconciliation,
    });
  }
}
