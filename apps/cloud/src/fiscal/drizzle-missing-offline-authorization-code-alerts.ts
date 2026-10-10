import type { AlertConditionObservation } from "@purosur/domain/alerts/use-cases";
import type { MissingOfflineAuthorizationCodeAlerts } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleAlertStore } from "../alerts/drizzle-alert-store.js";
import { observeAlertCondition } from "../alerts/observe-alert-condition.js";

export class DrizzleMissingOfflineAuthorizationCodeAlerts<TQueryResult extends PgQueryResultHKT>
  implements MissingOfflineAuthorizationCodeAlerts
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  openAlertScopes(): Promise<string[]> {
    return new DrizzleAlertStore(this.db, this.now).scopesOfOpenAlerts(
      "offline_authorization_code_missing",
    );
  }

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    await observeAlertCondition(this.db, observation, { now: this.now });
  }
}
