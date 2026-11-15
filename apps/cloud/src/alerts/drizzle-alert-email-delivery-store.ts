import { isAlertKind } from "@purosur/domain";
import type {
  AlertEmailAttempt,
  AlertEmailDeliveryStore,
  AlertEmailFailure,
  AlertEmailSent,
  PendingAlertEmailDelivery,
} from "@purosur/domain/alerts/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alertEmailDeliveries, alerts, branchSettings, users } from "../platform/db/schema.js";

export class DrizzleAlertEmailDeliveryStore<TQueryResult extends PgQueryResultHKT>
  implements AlertEmailDeliveryStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async pendingEmailDeliveries(): Promise<PendingAlertEmailDelivery[]> {
    const rows = await this.db
      .select({
        deliveryId: alertEmailDeliveries.id,
        to: users.email,
        alertId: alertEmailDeliveries.alertId,
        kind: alerts.kind,
        alertBranchAddress: branchSettings.address,
        recipientActive: users.active,
        recipientAlertEmailOptedInAt: users.alertEmailOptedInAt,
        stage: alertEmailDeliveries.stage,
        level: alertEmailDeliveries.level,
        occurredAt: alertEmailDeliveries.occurredAt,
        attemptsMade: alertEmailDeliveries.attempts,
        nextAttemptAt: alertEmailDeliveries.nextAttemptAt,
      })
      .from(alertEmailDeliveries)
      .innerJoin(alerts, eq(alerts.id, alertEmailDeliveries.alertId))
      .innerJoin(users, eq(users.id, alertEmailDeliveries.recipientUserId))
      .leftJoin(branchSettings, eq(branchSettings.locationId, alerts.locationId))
      .where(eq(alertEmailDeliveries.status, "pending"))
      .orderBy(asc(alertEmailDeliveries.createdAt), asc(alertEmailDeliveries.id));
    return rows.flatMap(({ kind, recipientAlertEmailOptedInAt, ...row }) =>
      isAlertKind(kind)
        ? [{ ...row, kind, recipientAlertEmailOptedIn: recipientAlertEmailOptedInAt !== null }]
        : [],
    );
  }

  async recordEmailAttempt(deliveryId: string, attempt: AlertEmailAttempt): Promise<void> {
    await this.db
      .update(alertEmailDeliveries)
      .set({ attempts: attempt.attempt, nextAttemptAt: attempt.nextAttemptAt })
      .where(eq(alertEmailDeliveries.id, deliveryId));
  }

  async recordEmailSent(deliveryId: string, sent: AlertEmailSent): Promise<void> {
    await this.db
      .update(alertEmailDeliveries)
      .set({
        status: "sent",
        sentAt: sent.sentAt,
        providerMessageId: sent.providerMessageId,
        error: null,
      })
      .where(eq(alertEmailDeliveries.id, deliveryId));
  }

  async recordEmailSkipped(deliveryId: string): Promise<void> {
    await this.db
      .update(alertEmailDeliveries)
      .set({ status: "skipped" })
      .where(eq(alertEmailDeliveries.id, deliveryId));
  }

  async recordEmailFailure(deliveryId: string, failure: AlertEmailFailure): Promise<void> {
    await this.db
      .update(alertEmailDeliveries)
      .set({ error: failure.error, ...(failure.final ? { status: "failed" as const } : {}) })
      .where(eq(alertEmailDeliveries.id, deliveryId));
  }
}
