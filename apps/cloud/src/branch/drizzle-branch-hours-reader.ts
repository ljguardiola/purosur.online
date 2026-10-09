import type { BranchHoursReader } from "@purosur/domain/alerts/use-cases";
import type { BranchDayHoursRange } from "@purosur/domain/branch/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { branchHours } from "../platform/db/schema.js";

// Postgres' `time` type answers with seconds ("09:00:00"); branch hours are only ever HH:MM.
function hoursMinutes(time: string): string {
  return time.slice(0, 5);
}

export async function readBranchHours<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<BranchDayHoursRange[]> {
  const hours = await db
    .select({
      dayOfWeek: branchHours.dayOfWeek,
      position: branchHours.position,
      opensAt: branchHours.opensAt,
      closesAt: branchHours.closesAt,
    })
    .from(branchHours)
    .where(eq(branchHours.locationId, locationId))
    .orderBy(asc(branchHours.dayOfWeek), asc(branchHours.position));
  return hours.map((range) => ({
    ...range,
    opensAt: hoursMinutes(range.opensAt),
    closesAt: hoursMinutes(range.closesAt),
  }));
}

export class DrizzleBranchHoursReader<TQueryResult extends PgQueryResultHKT>
  implements BranchHoursReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  branchHours(locationId: string): Promise<BranchDayHoursRange[]> {
    return readBranchHours(this.db, locationId);
  }
}
