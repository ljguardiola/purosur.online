import type { OpenAlertInput } from "@purosur/domain";
import type { ExceptionShareBreachAlerts } from "@purosur/domain/alerts/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts } from "../platform/db/schema.js";
import { openAlert } from "./open-alert.js";

export class DrizzleExceptionShareBreachAlerts<TQueryResult extends PgQueryResultHKT>
  implements ExceptionShareBreachAlerts
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  async hasOpenedBreachAlert(scope: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.kind, "exception_share_breach"), eq(alerts.scope, scope)))
      .limit(1);
    return row !== undefined;
  }

  async openBreachAlert(alert: OpenAlertInput): Promise<void> {
    await openAlert(this.db, alert, { now: this.now });
  }
}
