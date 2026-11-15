import type { AlertEmailDeliveryStore, AlertEmailLanes } from "@purosur/domain/alerts/use-cases";
import { sql } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { DrizzleAlertEmailDeliveryStore } from "./drizzle-alert-email-delivery-store.js";

const ALERT_EMAIL_LOCK_KEY = "alert_email_delivery";

export class DrizzleAlertEmailLanes<TQueryResult extends PgQueryResultHKT>
  implements AlertEmailLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;

  constructor(connections: DedicatedConnections<TQueryResult>) {
    this.connections = connections;
  }

  inAlertEmailLane<TOutcome>(
    work: (store: AlertEmailDeliveryStore) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.connections.withConnection(async (db) => {
      const key = sql`hashtextextended(${ALERT_EMAIL_LOCK_KEY}, 0)`;
      await db.execute(sql`select pg_advisory_lock(${key})`);
      try {
        return await work(new DrizzleAlertEmailDeliveryStore(db));
      } finally {
        await db.execute(sql`select pg_advisory_unlock(${key})`);
      }
    });
  }
}
