import { type SQL, sql } from "drizzle-orm";
import { APPLY_SYNCED_EVENTS_TASK_IDENTIFIER } from "./apply-synced-events-task.js";

interface SqlExecutor {
  execute(query: SQL): PromiseLike<unknown>;
}

export type EnqueueEventApplication = (transaction: SqlExecutor) => Promise<void>;

// graphile-worker's JavaScript `addJob` runs on its own pool, so it cannot join the push's
// transaction; its SQL function can. The job key makes the pushes that arrive before the worker
// picks the job up share one job.
export const enqueueEventApplicationJob: EnqueueEventApplication = async (transaction) => {
  await transaction.execute(
    sql`select graphile_worker.add_job(${APPLY_SYNCED_EVENTS_TASK_IDENTIFIER}, job_key => ${APPLY_SYNCED_EVENTS_TASK_IDENTIFIER})`,
  );
};
