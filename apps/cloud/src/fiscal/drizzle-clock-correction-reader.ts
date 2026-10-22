import { isOpenAlert } from "@purosur/domain";
import type {
  BranchClockCorrection,
  ClockCorrectionReader,
} from "@purosur/domain/fiscal/use-cases";
import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts, clockCorrections, registers, users } from "../platform/db/schema.js";

export class DrizzleClockCorrectionReader<TQueryResult extends PgQueryResultHKT>
  implements ClockCorrectionReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async listBranchClockCorrections(locationId: string): Promise<BranchClockCorrection[]> {
    const rows = await this.db
      .select({
        eventId: clockCorrections.eventId,
        correctedAt: clockCorrections.correctedAt,
        registerId: registers.id,
        registerName: registers.name,
        pointOfSale: clockCorrections.pointOfSale,
        documentType: clockCorrections.documentType,
        actorId: users.id,
        actorFirstName: users.firstName,
        previousReading: clockCorrections.previousReading,
        previousReadingSource: clockCorrections.previousReadingSource,
        correctedReading: clockCorrections.correctedReading,
        resolvedAt: alerts.resolvedAt,
      })
      .from(clockCorrections)
      .innerJoin(registers, eq(registers.id, clockCorrections.registerId))
      .innerJoin(users, eq(users.id, clockCorrections.actorId))
      .innerJoin(alerts, eq(alerts.id, clockCorrections.alertId))
      .where(eq(registers.locationId, locationId))
      .orderBy(desc(clockCorrections.correctedAt), desc(clockCorrections.eventId));
    return rows.map(({ resolvedAt, ...row }) => ({
      ...row,
      alertState: isOpenAlert({ resolvedAt }) ? "open" : "closed",
    }));
  }
}
