import type {
  AlertConditionObservation,
  RejectedFortnightDocumentAlerts,
} from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { observeAlertCondition } from "./observe-alert-condition.js";

export class DrizzleRejectedFortnightDocumentAlerts<TQueryResult extends PgQueryResultHKT>
  implements RejectedFortnightDocumentAlerts
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly now: () => Date;

  constructor(db: PgDatabase<TQueryResult>, now: () => Date) {
    this.db = db;
    this.now = now;
  }

  rejectedDocumentAlertScopes(): Promise<string[]> {
    return new DrizzleAlertStore(this.db, this.now).scopesOfOpenAlerts(
      "fortnight_report_document_rejected",
    );
  }

  async observeAlertCondition(observation: AlertConditionObservation): Promise<void> {
    await observeAlertCondition(this.db, observation, { now: this.now });
  }
}
