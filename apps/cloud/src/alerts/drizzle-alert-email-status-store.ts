import type { AlertEmailStatusStore, SentAlertEmail } from "@purosur/domain/alerts/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alertEmailDeliveries } from "../platform/db/schema.js";

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

  async hasAlertEmailSendInFlight(): Promise<boolean> {
    const [row] = await this.db
      .select({ deliveryId: alertEmailDeliveries.id })
      .from(alertEmailDeliveries)
      .where(eq(alertEmailDeliveries.status, "pending"))
      .limit(1);
    return row !== undefined;
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
