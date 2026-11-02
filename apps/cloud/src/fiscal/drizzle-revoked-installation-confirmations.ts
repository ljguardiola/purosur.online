import type {
  FortnightReportKey,
  RevokedInstallationConfirmations,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { revokedInstallationConfirmations } from "../platform/db/schema.js";

export class DrizzleRevokedInstallationConfirmations<TQueryResult extends PgQueryResultHKT>
  implements RevokedInstallationConfirmations
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async confirmedInstallations({
    pointOfSaleNumber,
    fortnight,
  }: FortnightReportKey): Promise<string[]> {
    const confirmed = await this.db
      .select({ installationId: revokedInstallationConfirmations.installationId })
      .from(revokedInstallationConfirmations)
      .where(
        and(
          eq(revokedInstallationConfirmations.pointOfSaleNumber, pointOfSaleNumber),
          eq(revokedInstallationConfirmations.fortnightStart, fortnight.start),
        ),
      );
    return confirmed.map(({ installationId }) => installationId);
  }
}
