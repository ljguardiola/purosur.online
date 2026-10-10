import {
  type ApplyPendingEventsOutcome,
  applyPendingEvents,
  type QuarantinedEvent,
} from "@purosur/domain/sync/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { reportError } from "../platform/error-reporting.js";
import { DrizzleEventApplication } from "./drizzle-event-application.js";
import { syncedEventUpcaster } from "./synced-event-upcaster.js";

export const APPLY_SYNCED_EVENTS_TASK_IDENTIFIER = "apply-synced-events";

const APPLY_SYNCED_EVENTS_CRONTAB_LINE = `* * * * * ${APPLY_SYNCED_EVENTS_TASK_IDENTIFIER}`;

const EVENTS_PER_RUN = 200;

// Drizzle appends the values a failed query was given, which can carry a sale's buyer.
const QUERY_PARAMETERS_PATTERN = /\nparams: [\s\S]*$/;

function reportQuarantine(
  report: typeof reportError,
  { error, ...context }: QuarantinedEvent,
): void {
  report(
    "sync: a synced event was quarantined",
    new Error(error.replace(QUERY_PARAMETERS_PATTERN, "")),
    { context: { ...context } },
  );
}

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
  report?: typeof reportError;
}

export function applySyncedEventsJobs(
  options: { now: () => Date },
  deps: ApplySyncedEventsJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doApply = deps.apply ?? applySyncedEventsTask;
  const doReport = deps.report ?? reportError;
  return {
    taskList: {
      [APPLY_SYNCED_EVENTS_TASK_IDENTIFIER]: async (_payload, helpers) => {
        const outcome = await helpers.withPgClient((client) =>
          doApply(doCreateDatabase(client), { now: options.now }),
        );
        if (outcome.kind === "processed") {
          for (const quarantined of outcome.quarantined) {
            reportQuarantine(doReport, quarantined);
          }
        }
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
