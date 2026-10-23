import type { AlertKind } from "@purosur/domain";
import type { OpenAlertStanding, OpenAlertStandingReader } from "@purosur/domain/alerts/use-cases";
import { and, eq, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { alerts } from "../platform/db/schema.js";
import { openAlertCondition } from "./open-alert-condition.js";

export class DrizzleOpenAlertStandingReader<TQueryResult extends PgQueryResultHKT>
  implements OpenAlertStandingReader
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async openAlertsOfScopes(
    kind: AlertKind,
    scopes: readonly string[],
  ): Promise<OpenAlertStanding[]> {
    if (scopes.length === 0) {
      return [];
    }
    return this.db
      .select({ scope: alerts.scope, level: alerts.level, escalatedAt: alerts.escalatedAt })
      .from(alerts)
      .where(and(eq(alerts.kind, kind), inArray(alerts.scope, [...scopes]), openAlertCondition()));
  }
}
