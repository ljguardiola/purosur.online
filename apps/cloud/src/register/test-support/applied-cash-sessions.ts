import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleEventApplication } from "../../sync/drizzle-event-application.js";
import {
  aCashSessionClosedFact,
  aCashSessionOpenedFact,
} from "../../sync/test-support/synced-facts.js";

function eventOf(deviceId: string, sessionId: string, eventType: string, occurredAt: Date) {
  return unappliedEventOf(
    {
      event_id: randomUUID(),
      device_seq: 1,
      aggregate_type: "CashSession",
      aggregate_id: sessionId,
      event_type: eventType,
      schema_version: 1,
      payload: {},
      occurred_at: occurredAt.toISOString(),
      actor_id: randomUUID(),
      chain_hmac: "hmac",
    },
    { deviceId },
  );
}

export async function applyOpenedCashSession<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  session: { deviceId: string; openedBy: string; openedAt: Date },
): Promise<string> {
  const { deviceId, openedBy, openedAt } = session;
  const id = randomUUID();
  const application = new DrizzleEventApplication(
    db,
    () => openedAt,
    async () => {},
  );
  await application.transaction(async (tx) => {
    await tx.record(
      aCashSessionOpenedFact({ id, openedBy, openedAt }),
      eventOf(deviceId, id, "cash_session_opened", openedAt),
    );
  });
  return id;
}

export async function applyClosedCashSession<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  closing: {
    deviceId: string;
    sessionId: string;
    closedBy: string;
    closedAt: Date;
    expectedCash: number;
    countedCash: number;
  },
): Promise<void> {
  const { deviceId, sessionId, closedBy, closedAt, expectedCash, countedCash } = closing;
  const application = new DrizzleEventApplication(
    db,
    () => closedAt,
    async () => {},
  );
  await application.transaction(async (tx) => {
    await tx.record(
      aCashSessionClosedFact({
        id: sessionId,
        closedBy,
        closedAt,
        expectedCash,
        countedCash,
        difference: countedCash - expectedCash,
      }),
      eventOf(deviceId, sessionId, "cash_session_closed", closedAt),
    );
  });
}
