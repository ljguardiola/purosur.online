import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  registerContingencyIntervals,
  registerContingencyReporting,
  registerInstallations,
} from "../platform/db/schema.js";

interface AppliedRegister {
  registerId: string;
}

type Tx<TQueryResult extends PgQueryResultHKT> = PgDatabase<TQueryResult>;

export async function recordAppliedContingencyEntered<TQueryResult extends PgQueryResultHKT>(
  tx: Tx<TQueryResult>,
  { registerId }: AppliedRegister,
  { interval }: Extract<SyncedFact, { kind: "contingency_entered" }>,
): Promise<void> {
  await tx
    .insert(registerContingencyIntervals)
    .values({ intervalId: interval.intervalId, registerId, startedAt: interval.startedAt })
    .onConflictDoNothing({ target: registerContingencyIntervals.intervalId });
}

export async function recordAppliedContingencyLeft<TQueryResult extends PgQueryResultHKT>(
  tx: Tx<TQueryResult>,
  { registerId }: AppliedRegister,
  { interval }: Extract<SyncedFact, { kind: "contingency_left" }>,
): Promise<void> {
  await tx
    .insert(registerContingencyIntervals)
    .values({
      intervalId: interval.intervalId,
      registerId,
      startedAt: interval.startedAt,
      endedAt: interval.endedAt,
    })
    .onConflictDoUpdate({
      target: registerContingencyIntervals.intervalId,
      set: { endedAt: interval.endedAt },
      setWhere: sql`${registerContingencyIntervals.endedAt} is null`,
    });
}

export async function recordAppliedContingencyReportingStarted<
  TQueryResult extends PgQueryResultHKT,
>(
  tx: Tx<TQueryResult>,
  { registerId, deviceId }: AppliedRegister & { deviceId: string },
  { reporting }: Extract<SyncedFact, { kind: "contingency_reporting_started" }>,
): Promise<void> {
  const since = reporting.fromEnrollment ? await enrolledAt(tx, deviceId) : reporting.since;
  await tx
    .insert(registerContingencyReporting)
    .values({ registerId, since })
    .onConflictDoNothing({ target: registerContingencyReporting.registerId });
}

async function enrolledAt<TQueryResult extends PgQueryResultHKT>(
  tx: Tx<TQueryResult>,
  installationId: string,
): Promise<Date> {
  const [installation] = await tx
    .select({ enrolledAt: registerInstallations.enrolledAt })
    .from(registerInstallations)
    .where(eq(registerInstallations.id, installationId));
  if (!installation) {
    throw new Error(`installation ${installationId} is not a known register`);
  }
  return installation.enrolledAt;
}
