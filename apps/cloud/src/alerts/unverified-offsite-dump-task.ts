import { detectUnverifiedOffsiteDump } from "@purosur/domain/alerts/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { DrizzleOffsiteDumpCheckStore } from "../backups/drizzle-offsite-dump-check-store.js";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { observeAlertCondition } from "./observe-alert-condition.js";

export const UNVERIFIED_OFFSITE_DUMP_CHECK_TASK_IDENTIFIER = "unverified-offsite-dump-check";

const UNVERIFIED_OFFSITE_DUMP_CHECK_CRONTAB_LINE = `0 * * * * ${UNVERIFIED_OFFSITE_DUMP_CHECK_TASK_IDENTIFIER}`;

export interface UnverifiedOffsiteDumpCheckInput {
  now: () => Date;
  environment: string;
}

function detectUnverifiedOffsiteDumpTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { now, environment }: UnverifiedOffsiteDumpCheckInput,
) {
  return detectUnverifiedOffsiteDump(
    {
      checks: new DrizzleOffsiteDumpCheckStore(db, now),
      alerts: {
        observeAlertCondition: async (observation) => {
          await observeAlertCondition(db, observation, { now });
        },
      },
      clock: { now },
    },
    { environment },
  );
}

export interface UnverifiedOffsiteDumpJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  detect?: typeof detectUnverifiedOffsiteDumpTask;
}

export function unverifiedOffsiteDumpJobs(
  options: UnverifiedOffsiteDumpCheckInput,
  deps: UnverifiedOffsiteDumpJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doDetect = deps.detect ?? detectUnverifiedOffsiteDumpTask;
  return {
    taskList: {
      [UNVERIFIED_OFFSITE_DUMP_CHECK_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => doDetect(doCreateDatabase(client), options));
      },
    },
    crontab: [UNVERIFIED_OFFSITE_DUMP_CHECK_CRONTAB_LINE],
  };
}
