import type { OpenAlertInput } from "@purosur/domain";
import type { FortnightReportRegularizationAlerts } from "@purosur/domain/alerts/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts } from "../platform/db/schema.js";
import { openAlert } from "./open-alert.js";

export class DrizzleFortnightReportRegularizationAlerts<TQueryResult extends PgQueryResultHKT>
  implements FortnightReportRegularizationAlerts
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  async hasOpenedRegularizationAlert(scope: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.kind, "fortnight_report_needs_regularization"), eq(alerts.scope, scope)))
      .limit(1);
    return row !== undefined;
  }

  async openRegularizationAlert(alert: OpenAlertInput): Promise<void> {
    await openAlert(this.db, alert, { now: this.now });
  }
}
