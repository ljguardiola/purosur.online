import type { RegisterEventStreams } from "@purosur/domain/fiscal/use-cases";
import { eq, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { deviceState, inbox, registerInstallations } from "../platform/db/schema.js";

type InstallationStreamReach = Awaited<ReturnType<RegisterEventStreams["installationsOf"]>>[number];

export function installationStreamReaches<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  condition: SQL,
): Promise<InstallationStreamReach[]> {
  return db
    .select({
      installationId: registerInstallations.id,
      enrolledAt: registerInstallations.enrolledAt,
      revokedAt: registerInstallations.revokedAt,
      latestOccurredAt:
        sql<Date | null>`max(${inbox.occurredAt}) filter (where ${inbox.appliedAt} is not null)`.mapWith(
          inbox.occurredAt,
        ),
      caughtUpAt: deviceState.caughtUpAt,
      holdsUnappliedEvents: sql<boolean>`count(${inbox.eventId}) filter (where ${inbox.appliedAt} is null) > 0`,
    })
    .from(registerInstallations)
    .leftJoin(inbox, eq(inbox.deviceId, registerInstallations.id))
    .leftJoin(deviceState, eq(deviceState.deviceId, registerInstallations.id))
    .where(condition)
    .groupBy(registerInstallations.id, deviceState.deviceId);
}

export class DrizzleRegisterEventStreams<TQueryResult extends PgQueryResultHKT>
  implements RegisterEventStreams
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  installationsOf(registerId: string): Promise<InstallationStreamReach[]> {
    return installationStreamReaches(this.db, eq(registerInstallations.registerId, registerId));
  }
}
