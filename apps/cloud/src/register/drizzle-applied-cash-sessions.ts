import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { cashMovements, cashSessions } from "../platform/db/schema.js";

type FactOf<TKind extends SyncedFact["kind"]> = Extract<SyncedFact, { kind: TKind }>;

export interface AppliedOrigin {
  locationId: string;
  registerId: string;
  deviceId: string;
}

export async function openAppliedCashSession<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  origin: AppliedOrigin,
  { session }: FactOf<"cash_session_opened">,
): Promise<void> {
  await tx.insert(cashSessions).values({ ...origin, ...session });
}

export async function closeAppliedCashSession<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  { session }: FactOf<"cash_session_closed">,
): Promise<void> {
  const { id, ...closing } = session;
  const closed = await tx
    .update(cashSessions)
    .set(closing)
    .where(eq(cashSessions.id, id))
    .returning({ id: cashSessions.id });
  if (closed.length === 0) {
    throw new Error(`cash session ${id} was never opened`);
  }
}

export async function recordAppliedCashMovement<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  movementId: string,
  { movement }: FactOf<"cash_movement_recorded">,
): Promise<void> {
  await tx.insert(cashMovements).values({ id: movementId, ...movement });
}
