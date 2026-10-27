import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleEventApplication } from "../../sync/drizzle-event-application.js";
import {
  aCashSessionOpenedFact,
  aCompletedSale,
  aReturnOf,
  type CompletedSale,
  type ReturnedSale,
} from "../../sync/test-support/synced-facts.js";

export async function applyReturn<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: {
    deviceId: string;
    soldAt: Date;
    returnedAt: Date;
    sale?: Partial<CompletedSale>;
    saleReturn?: Partial<ReturnedSale>;
  },
): Promise<{ completed: CompletedSale; saleReturn: ReturnedSale }> {
  const { deviceId, soldAt, returnedAt } = input;
  const application = new DrizzleEventApplication(
    db,
    () => returnedAt,
    async () => {},
  );
  const saleSessionId = randomUUID();
  const returnSessionId = randomUUID();
  const completed = aCompletedSale({
    sessionId: saleSessionId,
    completedAt: soldAt,
    ...input.sale,
  });
  const saleReturn = aReturnOf(completed, {
    sessionId: returnSessionId,
    actorId: completed.actorId,
    occurredAt: returnedAt,
    stockMovements: [],
    ...input.saleReturn,
  });
  const eventOf = (
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    occurredAt: Date,
  ) =>
    unappliedEventOf(
      {
        event_id: randomUUID(),
        device_seq: 1,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        event_type: eventType,
        schema_version: 1,
        payload: {},
        occurred_at: occurredAt.toISOString(),
        actor_id: completed.actorId,
        chain_hmac: "hmac",
      },
      { deviceId },
    );
  await application.transaction(async (tx) => {
    await tx.record(
      aCashSessionOpenedFact({ id: saleSessionId, openedAt: soldAt }),
      eventOf("CashSession", saleSessionId, "cash_session_opened", soldAt),
    );
    await tx.record(
      { kind: "sale_completed", sale: completed },
      eventOf("Sale", completed.id, "sale_completed", soldAt),
    );
    await tx.record(
      aCashSessionOpenedFact({ id: returnSessionId, openedAt: returnedAt }),
      eventOf("CashSession", returnSessionId, "cash_session_opened", returnedAt),
    );
    await tx.record(
      { kind: "sale_returned", saleReturn, creditNote: null },
      eventOf("Sale", completed.id, "sale_returned", returnedAt),
    );
  });
  return { completed, saleReturn };
}
