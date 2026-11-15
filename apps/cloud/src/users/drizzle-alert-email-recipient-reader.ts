import type {
  AlertEmailRecipient,
  AlertEmailRecipientReader,
} from "@purosur/domain/alerts/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users } from "../platform/db/schema.js";

export class DrizzleAlertEmailRecipientReader<TQueryResult extends PgQueryResultHKT>
  implements AlertEmailRecipientReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async alertEmailRecipient(userId: string): Promise<AlertEmailRecipient | undefined> {
    const [row] = await this.db
      .select({
        email: users.email,
        active: users.active,
        alertEmailOptedInAt: users.alertEmailOptedInAt,
      })
      .from(users)
      .where(eq(users.id, userId));
    return row === undefined
      ? undefined
      : {
          email: row.email,
          active: row.active,
          alertEmailOptedIn: row.alertEmailOptedInAt !== null,
        };
  }
}
