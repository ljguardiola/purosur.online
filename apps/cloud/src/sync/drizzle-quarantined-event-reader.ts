import type {
  QuarantinedEventListing,
  QuarantinedEventReader,
} from "@purosur/domain/sync/use-cases";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { inbox, registerInstallations, registers } from "../platform/db/schema.js";

export class DrizzleQuarantinedEventReader<TQueryResult extends PgQueryResultHKT>
  implements QuarantinedEventReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async quarantinedEventsOfBranch(locationId: string): Promise<QuarantinedEventListing[]> {
    const rows = await this.db
      .select({
        eventId: inbox.eventId,
        registerName: registers.name,
        aggregateType: inbox.aggregateType,
        aggregateId: inbox.aggregateId,
        eventType: inbox.eventType,
        receivedAt: inbox.receivedAt,
        quarantinedAt: inbox.quarantinedAt,
        lastError: inbox.lastError,
      })
      .from(inbox)
      .innerJoin(registerInstallations, eq(registerInstallations.id, inbox.deviceId))
      .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
      .where(
        and(
          eq(registers.locationId, locationId),
          isNull(inbox.appliedAt),
          isNotNull(inbox.quarantinedAt),
        ),
      )
      .orderBy(asc(inbox.quarantinedAt), asc(inbox.eventId));
    return rows.flatMap(({ quarantinedAt, ...row }) =>
      quarantinedAt === null ? [] : [{ ...row, quarantinedAt }],
    );
  }
}
