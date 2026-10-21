import { randomUUID } from "node:crypto";
import { unappliedEventOf } from "@purosur/contracts/sync/test-support/unapplied-event";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleEventApplication } from "../../sync/drizzle-event-application.js";
import {
  aCancelledSale,
  aCashSessionOpenedFact,
  aCompletedSale,
  aVoidedSaleOf,
  type CancelledSale,
  type CompletedSale,
  type VoidedSale,
} from "../../sync/test-support/synced-facts.js";

export async function applyCompletedSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  sale: {
    deviceId: string;
    completedAt: Date;
    total: number;
    overrides?: Partial<CompletedSale>;
    inOpenSession?: string;
  },
): Promise<string> {
  const { deviceId, completedAt, total, overrides, inOpenSession } = sale;
  const application = new DrizzleEventApplication(
    db,
    () => completedAt,
    async () => {},
  );
  const sessionId = inOpenSession ?? randomUUID();
  const completed = aCompletedSale({
    sessionId,
    completedAt,
    total,
    lines: [],
    cashMovements: [],
    ...overrides,
  });
  const eventOf = (aggregateType: string, aggregateId: string, eventType: string) =>
    unappliedEventOf(
      {
        event_id: randomUUID(),
        device_seq: 1,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        event_type: eventType,
        schema_version: 2,
        payload: {},
        occurred_at: completedAt.toISOString(),
        actor_id: completed.actorId,
        chain_hmac: "hmac",
      },
      { deviceId },
    );
  await application.transaction(async (tx) => {
    if (inOpenSession === undefined) {
      await tx.record(
        aCashSessionOpenedFact({ id: sessionId, openedAt: completedAt }),
        eventOf("CashSession", sessionId, "cash_session_opened"),
      );
    }
    await tx.record(
      { kind: "sale_completed", sale: completed },
      eventOf("Sale", completed.id, "sale_completed"),
    );
  });
  return completed.id;
}

export async function applyCancelledSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  sale: {
    deviceId: string;
    cancelledAt: Date;
    total: number;
    overrides?: Partial<CancelledSale>;
  },
): Promise<CancelledSale> {
  const { deviceId, cancelledAt, total, overrides } = sale;
  const application = new DrizzleEventApplication(
    db,
    () => cancelledAt,
    async () => {},
  );
  const sessionId = randomUUID();
  const cancelled = aCancelledSale({ cancelledAt, total, lines: [], ...overrides, sessionId });
  const eventOf = (aggregateType: string, aggregateId: string, eventType: string) =>
    unappliedEventOf(
      {
        event_id: randomUUID(),
        device_seq: 1,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        event_type: eventType,
        schema_version: 1,
        payload: {},
        occurred_at: cancelledAt.toISOString(),
        actor_id: cancelled.actorId,
        chain_hmac: "hmac",
      },
      { deviceId },
    );
  await application.transaction(async (tx) => {
    await tx.record(
      aCashSessionOpenedFact({ id: sessionId, openedAt: cancelledAt }),
      eventOf("CashSession", sessionId, "cash_session_opened"),
    );
    await tx.record(
      { kind: "sale_cancelled", sale: cancelled },
      eventOf("Sale", cancelled.id, "sale_cancelled"),
    );
  });
  return cancelled;
}

export async function applyVoidedSale<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  sale: {
    deviceId: string;
    completedAt: Date;
    voidedAt: Date;
    completed: Partial<CompletedSale>;
  },
): Promise<VoidedSale> {
  const { deviceId, completedAt, voidedAt, completed: overrides } = sale;
  const application = new DrizzleEventApplication(
    db,
    () => voidedAt,
    async () => {},
  );
  const sessionId = randomUUID();
  const completed = aCompletedSale({
    sessionId,
    completedAt,
    lines: [],
    cashMovements: [],
    ...overrides,
  });
  const voided = aVoidedSaleOf(completed, { voidedAt });
  const eventOf = (aggregateType: string, aggregateId: string, eventType: string) =>
    unappliedEventOf(
      {
        event_id: randomUUID(),
        device_seq: 1,
        aggregate_type: aggregateType,
        aggregate_id: aggregateId,
        event_type: eventType,
        schema_version: 1,
        payload: {},
        occurred_at: voidedAt.toISOString(),
        actor_id: completed.actorId,
        chain_hmac: "hmac",
      },
      { deviceId },
    );
  await application.transaction(async (tx) => {
    await tx.record(
      aCashSessionOpenedFact({ id: sessionId, openedAt: completedAt }),
      eventOf("CashSession", sessionId, "cash_session_opened"),
    );
    await tx.record(
      { kind: "sale_completed", sale: completed },
      eventOf("Sale", completed.id, "sale_completed"),
    );
    await tx.record(
      { kind: "sale_voided", sale: voided },
      eventOf("Sale", completed.id, "sale_voided"),
    );
  });
  return voided;
}
