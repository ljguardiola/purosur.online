import { escalateOverdueAlerts } from "@purosur/domain/alerts/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";

export const ALERT_ESCALATION_TASK_IDENTIFIER = "alert-escalation";

const ALERT_ESCALATION_CRONTAB_LINE = `*/5 * * * * ${ALERT_ESCALATION_TASK_IDENTIFIER}`;

export function escalateAlertsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return escalateOverdueAlerts({
    store: new DrizzleAlertStore(db, deps.now),
    clock: { now: deps.now },
  });
}

export interface AlertEscalationJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  escalate?: typeof escalateAlertsTask;
}

export function alertEscalationJobs(
  options: { now: () => Date },
  deps: AlertEscalationJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doEscalate = deps.escalate ?? escalateAlertsTask;
  return {
    taskList: {
      [ALERT_ESCALATION_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) =>
          doEscalate(doCreateDatabase(client), { now: options.now }),
        );
      },
    },
    crontab: [ALERT_ESCALATION_CRONTAB_LINE],
  };
}
