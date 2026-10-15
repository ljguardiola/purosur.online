import type { OpenAlertInput } from "@purosur/domain";
import type {
  AlertConditionObservation,
  FortnightReportDeadlineAlerts,
} from "@purosur/domain/alerts/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts } from "../platform/db/schema.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { observeAlertCondition } from "./observe-alert-condition.js";
import { openAlert } from "./open-alert.js";

export class DrizzleFortnightReportDeadlineAlerts<TQueryResult extends PgQueryResultHKT>
  implements FortnightReportDeadlineAlerts
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  pendingAlertScopes(): Promise<string[]> {
    return new DrizzleAlertStore(this.db, this.now).scopesOfOpenAlerts("fortnight_report_pending");
  }

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    await observeAlertCondition(this.db, observation, { now: this.now });
  }

  async hasOpenedOverdueAlert(scope: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.kind, "fortnight_report_overdue"), eq(alerts.scope, scope)))
      .limit(1);
    return row !== undefined;
  }

  async openOverdueAlert(alert: OpenAlertInput): Promise<void> {
    await openAlert(this.db, alert, { now: this.now });
  }
}
