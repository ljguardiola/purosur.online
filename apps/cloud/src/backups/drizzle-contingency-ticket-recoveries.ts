import type {
  AwaitingContingencyTicketRecoveries,
  AwaitingContingencyTicketRecovery,
  ContingencyTicketRecoveries,
  ContingencyTicketRecoveryStanding,
  ContingencyTicketRecoveryTransaction,
  FinishedContingencyTicketRecovery,
  LockedContingencyTicketRecovery,
  OpenContingencyTicketRecovery,
} from "@purosur/domain/backups/use-cases";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  contingencyTicketRecoveries,
  registerInstallations,
  registers,
} from "../platform/db/schema.js";

class DrizzleContingencyTicketRecoveryTransaction<TQueryResult extends PgQueryResultHKT>
  implements ContingencyTicketRecoveryTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;

  constructor(tx: PgDatabase<TQueryResult>) {
    this.tx = tx;
  }

  async openRecovery({
    registerId,
    restoredDeviceId,
    at,
  }: OpenContingencyTicketRecovery): Promise<ContingencyTicketRecoveryStanding> {
    await this.tx
      .insert(contingencyTicketRecoveries)
      .values({ registerId, restoredDeviceId, openedAt: at })
      .onConflictDoNothing({ target: contingencyTicketRecoveries.restoredDeviceId });
    const [recovery] = await this.tx
      .select({ finishedAt: contingencyTicketRecoveries.finishedAt })
      .from(contingencyTicketRecoveries)
      .where(eq(contingencyTicketRecoveries.restoredDeviceId, restoredDeviceId));
    if (!recovery) {
      throw new Error("the contingency ticket recovery just opened is missing");
    }
    return recovery.finishedAt === null ? { kind: "awaiting" } : { kind: "finished" };
  }

  async lockRecovery(recoveryId: string): Promise<LockedContingencyTicketRecovery | undefined> {
    const [recovery] = await this.tx
      .select({
        registerId: contingencyTicketRecoveries.registerId,
        finishedAt: contingencyTicketRecoveries.finishedAt,
      })
      .from(contingencyTicketRecoveries)
      .where(eq(contingencyTicketRecoveries.id, recoveryId))
      .for("update");
    return recovery && { registerId: recovery.registerId, finished: recovery.finishedAt !== null };
  }

  async recordFinished({
    recoveryId,
    registerId,
    finishedBy,
    at,
  }: FinishedContingencyTicketRecovery): Promise<void> {
    await this.tx
      .update(contingencyTicketRecoveries)
      .set({ finishedAt: at, finishedBy })
      .where(eq(contingencyTicketRecoveries.id, recoveryId));
    await this.tx.insert(auditLog).values({
      entity: "contingency_ticket_recovery_finished",
      entityId: recoveryId,
      actorId: finishedBy,
      previousValue: null,
      newValue: { register_id: registerId },
      at,
    });
  }
}

export class DrizzleContingencyTicketRecoveries<TQueryResult extends PgQueryResultHKT>
  implements ContingencyTicketRecoveries, AwaitingContingencyTicketRecoveries
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: ContingencyTicketRecoveryTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleContingencyTicketRecoveryTransaction(tx)));
  }

  async awaiting(): Promise<AwaitingContingencyTicketRecovery[]> {
    return this.db
      .select({
        recoveryId: contingencyTicketRecoveries.id,
        registerId: contingencyTicketRecoveries.registerId,
        registerName: registers.name,
        openedAt: contingencyTicketRecoveries.openedAt,
      })
      .from(contingencyTicketRecoveries)
      .innerJoin(registers, eq(registers.id, contingencyTicketRecoveries.registerId))
      .innerJoin(
        registerInstallations,
        eq(registerInstallations.id, contingencyTicketRecoveries.restoredDeviceId),
      )
      .where(
        and(
          isNull(contingencyTicketRecoveries.finishedAt),
          isNull(registerInstallations.revokedAt),
        ),
      )
      .orderBy(asc(contingencyTicketRecoveries.openedAt), asc(contingencyTicketRecoveries.id));
  }
}
