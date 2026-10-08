import { type ApplyPendingEventsOutcome, applyPendingEvents } from "@purosur/domain/sync/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleEventApplication } from "./drizzle-event-application.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";

export const APPLY_SYNCED_EVENTS_TASK_IDENTIFIER = "apply-synced-events";

const APPLY_SYNCED_EVENTS_CRONTAB_LINE = `* * * * * ${APPLY_SYNCED_EVENTS_TASK_IDENTIFIER}`;

const EVENTS_PER_RUN = 200;

export function applySyncedEventsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<ApplyPendingEventsOutcome> {
  return applyPendingEvents(
    {
      eventApplication: new DrizzleEventApplication(db, deps.now),
      upcaster: syncedEventUpcaster,
      clock: { now: deps.now },
    },
    { limit: EVENTS_PER_RUN },
  );
}

export interface ApplySyncedEventsJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  apply?: typeof applySyncedEventsTask;
}

export function applySyncedEventsJobs(
  options: { now: () => Date },
  deps: ApplySyncedEventsJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doApply = deps.apply ?? applySyncedEventsTask;
  return {
    taskList: {
      [APPLY_SYNCED_EVENTS_TASK_IDENTIFIER]: async (_payload, helpers) => {
        const outcome = await helpers.withPgClient((client) =>
          doApply(doCreateDatabase(client), { now: options.now }),
        );
        if (outcome.kind === "processed" && outcome.limitReached) {
          await helpers.addJob(
            APPLY_SYNCED_EVENTS_TASK_IDENTIFIER,
            {},
            { jobKey: APPLY_SYNCED_EVENTS_TASK_IDENTIFIER },
          );
        }
      },
    },
    crontab: [APPLY_SYNCED_EVENTS_CRONTAB_LINE],
  };
}
