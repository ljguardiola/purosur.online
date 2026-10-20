import type { RegisterBackupStanding } from "@purosur/domain";
import type { RegisterBackupStandingReader } from "@purosur/domain/alerts/use-cases";
import { and, eq, exists, gt, isNull, max, min, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";
import {
  inbox,
  registerInstallations,
  registerSnapshotGenerations,
  registers,
} from "../platform/db/schema.js";

export class DrizzleRegisterBackupStandingReader<TQueryResult extends PgQueryResultHKT>
  implements RegisterBackupStandingReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async watchedRegisterBackupStandings(): Promise<RegisterBackupStanding[]> {
    const activeInstallation = alias(registerInstallations, "active_installation");
    const anyInstallation = alias(registerInstallations, "any_installation");
    const lastVerified = this.db
      .select({
        registerId: registerSnapshotGenerations.registerId,
        createdAt: max(registerSnapshotGenerations.createdAt).as("last_verified_at"),
      })
      .from(registerSnapshotGenerations)
      .where(eq(registerSnapshotGenerations.status, "verified"))
      .groupBy(registerSnapshotGenerations.registerId)
      .as("last_verified");
    const rows = await this.db
      .select({
        registerId: registers.id,
        lastVerifiedGenerationAt: lastVerified.createdAt,
        firstChangeSinceLastVerifiedAt: min(inbox.occurredAt),
      })
      .from(registers)
      .leftJoin(lastVerified, eq(lastVerified.registerId, registers.id))
      .leftJoin(anyInstallation, eq(anyInstallation.registerId, registers.id))
      .leftJoin(
        inbox,
        and(
          eq(inbox.deviceId, anyInstallation.id),
          or(isNull(lastVerified.createdAt), gt(inbox.occurredAt, lastVerified.createdAt)),
        ),
      )
      .where(
        exists(
          this.db
            .select({ one: activeInstallation.id })
            .from(activeInstallation)
            .where(
              and(
                eq(activeInstallation.registerId, registers.id),
                isNull(activeInstallation.revokedAt),
              ),
            ),
        ),
      )
      .groupBy(registers.id, lastVerified.createdAt);
    return rows;
  }
}
