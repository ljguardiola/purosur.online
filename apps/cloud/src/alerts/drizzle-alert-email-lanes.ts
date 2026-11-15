import type {
  AlertEmailDeliveryStore,
  AlertEmailLaneRun,
  AlertEmailLanes,
} from "@purosur/domain/alerts/use-cases";
import { sql } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { DrizzleAlertEmailDeliveryStore } from "./drizzle-alert-email-delivery-store.js";

export const alertEmailLaneLockKey = sql`hashtextextended('alert_email_delivery', 0)`;

export class DrizzleAlertEmailLanes<TQueryResult extends PgQueryResultHKT>
  implements AlertEmailLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;

  constructor(connections: DedicatedConnections<TQueryResult>) {
    this.connections = connections;
  }

  inAlertEmailLane<TOutcome>(
    work: (store: AlertEmailDeliveryStore) => Promise<TOutcome>,
  ): Promise<AlertEmailLaneRun<TOutcome>> {
    return this.connections.withConnection(async (db) => {
      const [lock] = await db
        .select({ held: sql<boolean>`pg_try_advisory_lock(${alertEmailLaneLockKey})` })
        .from(sql`(values (1)) as attempt(one)`);
      if (lock?.held !== true) {
        return { kind: "busy" };
      }
      try {
        return { kind: "ran", result: await work(new DrizzleAlertEmailDeliveryStore(db)) };
      } finally {
        await db.execute(sql`select pg_advisory_unlock(${alertEmailLaneLockKey})`);
      }
    });
  }
}
