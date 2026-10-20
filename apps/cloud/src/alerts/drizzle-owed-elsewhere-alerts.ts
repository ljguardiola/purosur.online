import type {
  AlertConditionObservation,
  OwedElsewhereAlerts,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { observeAlertCondition } from "./observe-alert-condition.js";

export class DrizzleOwedElsewhereAlerts<TQueryResult extends PgQueryResultHKT>
  implements OwedElsewhereAlerts
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  owedElsewhereAlertScopes(): Promise<string[]> {
    return new DrizzleAlertStore(this.db, this.now).scopesOfOpenAlerts(
      "fortnight_report_owed_elsewhere",
    );
  }

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    await observeAlertCondition(this.db, observation, { now: this.now });
  }
}
