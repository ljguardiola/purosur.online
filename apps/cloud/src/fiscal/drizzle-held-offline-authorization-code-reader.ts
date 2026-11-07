import type {
  Fortnight,
  HeldOfflineAuthorizationCodeReader,
  OfflineAuthorizationCode,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { caeaCodes } from "../platform/db/schema.js";

export class DrizzleHeldOfflineAuthorizationCodeReader<TQueryResult extends PgQueryResultHKT>
  implements HeldOfflineAuthorizationCodeReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async heldCodeOf(fortnight: Fortnight): Promise<OfflineAuthorizationCode | null> {
    const [held] = await this.db
      .select()
      .from(caeaCodes)
      .where(eq(caeaCodes.fortnightStart, fortnight.start));
    return held
      ? {
          code: held.code,
          fortnight: { start: held.fortnightStart, end: held.fortnightEnd },
          reportDeadline: held.reportDeadline,
        }
      : null;
  }
}
