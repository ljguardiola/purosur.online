import type { RegisterEventStreams } from "@purosur/domain/fiscal/use-cases";
import { eq, max } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { inbox, registerInstallations } from "../platform/db/schema.js";

export class DrizzleRegisterEventStreams<TQueryResult extends PgQueryResultHKT>
  implements RegisterEventStreams
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async installationsOf(registerId: string) {
    return this.db
      .select({
        enrolledAt: registerInstallations.enrolledAt,
        revokedAt: registerInstallations.revokedAt,
        latestOccurredAt: max(inbox.occurredAt),
      })
      .from(registerInstallations)
      .leftJoin(inbox, eq(inbox.deviceId, registerInstallations.id))
      .where(eq(registerInstallations.registerId, registerId))
      .groupBy(registerInstallations.id);
  }
}
