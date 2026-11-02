import type {
  AlertConditionObservation,
  SecondMonthRiskAlerts,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { observeAlertCondition } from "./observe-alert-condition.js";

export class DrizzleSecondMonthAtRiskAlerts<TQueryResult extends PgQueryResultHKT>
  implements SecondMonthRiskAlerts
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  atRiskAlertScopes(): Promise<string[]> {
    return new DrizzleAlertStore(this.db, this.now).scopesOfOpenAlerts(
      "exception_share_second_month_at_risk",
    );
  }

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    await observeAlertCondition(this.db, observation, { now: this.now });
  }
}
