import { ARCA_VITALITY_CHECK_INTERVAL_MS } from "@purosur/domain";
import { type ArcaVitalityService, checkArcaVitality } from "@purosur/domain/fiscal/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleArcaVitalityStore } from "./drizzle-arca-vitality-store.js";

export const ARCA_VITALITY_CHECK_TASK_IDENTIFIER = "arca-vitality-check";
export const ARCA_VITALITY_WATCHDOG_TASK_IDENTIFIER = "arca-vitality-watchdog";

const ARCA_VITALITY_WATCHDOG_CRONTAB_LINE = `* * * * * ${ARCA_VITALITY_WATCHDOG_TASK_IDENTIFIER}`;

export interface ArcaVitalityCheckInput {
  now: () => Date;
  vitality: ArcaVitalityService;
}

function checkArcaVitalityTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { now, vitality }: ArcaVitalityCheckInput,
) {
  return checkArcaVitality({ vitality, store: new DrizzleArcaVitalityStore(db), clock: { now } });
}

export interface ArcaVitalityJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  check?: typeof checkArcaVitalityTask;
}

export function arcaVitalityJobs(
  options: ArcaVitalityCheckInput,
  deps: ArcaVitalityJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doCheck = deps.check ?? checkArcaVitalityTask;
  return {
    taskList: {
      [ARCA_VITALITY_CHECK_TASK_IDENTIFIER]: async (_payload, helpers) => {
        try {
          await helpers.withPgClient((client) => doCheck(doCreateDatabase(client), options));
        } finally {
          await helpers.addJob(
            ARCA_VITALITY_CHECK_TASK_IDENTIFIER,
            {},
            {
              jobKey: ARCA_VITALITY_CHECK_TASK_IDENTIFIER,
              jobKeyMode: "replace",
              runAt: new Date(options.now().getTime() + ARCA_VITALITY_CHECK_INTERVAL_MS),
            },
          );
        }
      },
      [ARCA_VITALITY_WATCHDOG_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.addJob(
          ARCA_VITALITY_CHECK_TASK_IDENTIFIER,
          {},
          { jobKey: ARCA_VITALITY_CHECK_TASK_IDENTIFIER, jobKeyMode: "preserve_run_at" },
        );
      },
    },
    crontab: [ARCA_VITALITY_WATCHDOG_CRONTAB_LINE],
  };
}
