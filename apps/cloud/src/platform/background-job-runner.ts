import { EventEmitter } from "node:events";
import type { Runner, RunnerOptions } from "graphile-worker";
import { consoleLogFactory, Logger, run } from "graphile-worker";
import pg, { type Pool } from "pg";
import type { BackgroundJobs } from "./background-jobs.js";
import { type ReportErrorDeps, reportError } from "./error-reporting.js";
import { reportPoolErrors } from "./pool-connection-error-handler.js";
import { runShutdownSteps } from "./run-shutdown-steps.js";

// Jobs for the same account still serialize on their own advisory lock, so a slow job never
// blocks jobs for other accounts.
const WORKER_CONCURRENCY = 2;

export interface BackgroundJobRunnerHandle {
  stop(): Promise<void>;
}

export interface StartBackgroundJobRunnerOptions {
  databaseUrl: string;
  jobs: readonly BackgroundJobs[];
  /** Only a test turns these off, so graphile-worker's wall-clock crontab never adds a run the test did not ask for. */
  schedules?: boolean;
}

export interface StartBackgroundJobRunnerDeps extends ReportErrorDeps {
  runWorker?: (options: RunnerOptions) => Promise<Runner>;
  /**
   * Owned here, not by graphile-worker's pool: it removes error handlers and calls `pgPool.end()`
   * without awaiting it once the runner stops, crashing on a client that disconnects mid-shutdown.
   */
  createPool?: (connectionString: string) => Pick<Pool, "on" | "end">;
}

function loggerReportingFatalErrors(deps: ReportErrorDeps): Logger {
  return new Logger((scope) => {
    const logToConsole = consoleLogFactory(scope);
    return (level, message, { fatalError }) => {
      if (level === "error" && fatalError !== undefined) {
        reportError(`background job runner: ${message}`, fatalError, deps);
      } else {
        logToConsole(level, message, {});
      }
    };
  });
}

export async function startBackgroundJobRunner(
  options: StartBackgroundJobRunnerOptions,
  deps: StartBackgroundJobRunnerDeps = {},
): Promise<BackgroundJobRunnerHandle> {
  const doRun = deps.runWorker ?? run;
  const doCreatePool =
    deps.createPool ?? ((connectionString: string) => new pg.Pool({ connectionString }));

  const pool = doCreatePool(options.databaseUrl);
  reportPoolErrors(pool, "background job runner");

  // graphile-worker 0.18 rejects a second stop() once its pool or cron already exited, emitting
  // "stop" synchronously on the events emitter when that happens.
  const events = new EventEmitter();
  let stoppedItself = false;
  events.once("stop", () => {
    stoppedItself = true;
  });

  const runner = await doRun({
    pgPool: pool as Pool,
    concurrency: WORKER_CONCURRENCY,
    logger: loggerReportingFatalErrors(deps),
    ...(options.schedules === false
      ? { parsedCronItems: [] }
      : {
          // graphile-worker 0.18's RunnerOptions takes this crontab string in place of a crontab file.
          crontab: options.jobs.flatMap((job) => job.crontab).join("\n"),
        }),
    events,
    taskList: Object.assign({}, ...options.jobs.map((job) => job.taskList)),
  });
  runner.promise.catch((error: unknown) => {
    reportError("background job runner: runner exited with an error", error, deps);
  });

  return {
    async stop() {
      await runShutdownSteps([
        {
          label: "background job runner",
          run: async () => {
            // runner.promise settles once graphile-worker's pool and cron exit, so a draining
            // job never sees the pool close from under it.
            try {
              if (!stoppedItself) {
                await runner.stop();
              }
            } finally {
              await runner.promise;
            }
          },
        },
        { label: "background job runner pool", run: () => pool.end() },
      ]);
    },
  };
}
