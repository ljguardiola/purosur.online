import { detectQuietRegisters, resolveStablyClearedAlerts } from "@purosur/domain/alerts/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { hashSourceAddress } from "../access/sign-in-lockout.js";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { DrizzleInServiceRegisterReader } from "./drizzle-in-service-register-reader.js";

export const ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER = "alert-condition-resolution";

const ALERT_CONDITION_RESOLUTION_CRONTAB_LINE = `* * * * * ${ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER}`;

function resolveClearedConditionAlertsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return resolveStablyClearedAlerts({
    store: new DrizzleAlertStore(db, deps.now),
    clock: { now: deps.now },
    hasher: { hash: hashSourceAddress },
  });
}

function detectQuietRegistersTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return detectQuietRegisters({
    registers: new DrizzleInServiceRegisterReader(db),
    store: new DrizzleAlertStore(db, deps.now),
    clock: { now: deps.now },
    hasher: { hash: hashSourceAddress },
  });
}

export interface AlertConditionResolutionJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  resolve?: typeof resolveClearedConditionAlertsTask;
  detectQuiet?: typeof detectQuietRegistersTask;
}

export function alertConditionResolutionJobs(
  options: { now: () => Date },
  deps: AlertConditionResolutionJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doResolve = deps.resolve ?? resolveClearedConditionAlertsTask;
  const doDetectQuiet = deps.detectQuiet ?? detectQuietRegistersTask;
  return {
    taskList: {
      [ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient(async (client) => {
          const db = doCreateDatabase(client);
          await doResolve(db, { now: options.now });
          await doDetectQuiet(db, { now: options.now });
        });
      },
    },
    crontab: [ALERT_CONDITION_RESOLUTION_CRONTAB_LINE],
  };
}
