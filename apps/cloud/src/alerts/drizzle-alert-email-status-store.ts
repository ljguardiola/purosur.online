import type { AlertEmailStatusStore, SentAlertEmail } from "@purosur/domain/alerts/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alertEmailDeliveries } from "../platform/db/schema.js";
import { alertEmailLaneLockKey } from "./drizzle-alert-email-lanes.js";

export class DrizzleAlertEmailStatusStore<TQueryResult extends PgQueryResultHKT>
  implements AlertEmailStatusStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async sentAlertEmailOfProviderMessage(
    providerMessageId: string,
  ): Promise<SentAlertEmail | undefined> {
    const [row] = await this.db
      .select({ deliveryId: alertEmailDeliveries.id })
      .from(alertEmailDeliveries)
      .where(
        and(
          eq(alertEmailDeliveries.providerMessageId, providerMessageId),
          eq(alertEmailDeliveries.status, "sent"),
        ),
      );
    return row;
  }

  async isAlertEmailSendRunning(): Promise<boolean> {
    const [lane] = await this.db
      .select({
        held: sql<boolean>`exists (
          select 1 from pg_locks
          where locktype = 'advisory'
            and objsubid = 1
            and database = (select oid from pg_database where datname = current_database())
            and ((classid::bigint << 32) | objid::bigint) = ${alertEmailLaneLockKey}
        )`,
      })
      .from(sql`(values (1)) as attempt(one)`);
    return lane?.held === true;
  }

  async isAlertEmailDeliveryPending(deliveryId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ deliveryId: alertEmailDeliveries.id })
      .from(alertEmailDeliveries)
      .where(
        and(eq(alertEmailDeliveries.id, deliveryId), eq(alertEmailDeliveries.status, "pending")),
      );
    return row !== undefined;
  }

  async recordEmailUndelivered(deliveryId: string): Promise<void> {
    await this.db
      .update(alertEmailDeliveries)
      .set({ status: "failed", error: "provider_undelivered" })
      .where(and(eq(alertEmailDeliveries.id, deliveryId), eq(alertEmailDeliveries.status, "sent")));
  }
}
