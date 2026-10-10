import { type SQL, sql } from "drizzle-orm";
import { OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER } from "./offline-authorization-code-task.js";

interface SqlExecutor {
  execute(query: SQL): PromiseLike<unknown>;
}

export type EnqueueOfflineAuthorizationCodeRequest = (transaction: SqlExecutor) => Promise<void>;

const REQUEST_PRIORITY = -10;
const REQUEST_MAX_ATTEMPTS = 10;

// graphile-worker's add_job resets the attempts of a job that is not running and moves its next run
// to now, so a pull that added the job again while ARCA keeps failing would speed the retries up.
// The job is added only when none with the key can still be attempted; a job that used up its
// attempts is replaced, which revives it. The advisory lock is taken in a statement of its own so the
// check after it sees what a concurrent pull committed.
export const enqueueOfflineAuthorizationCodeRequest: EnqueueOfflineAuthorizationCodeRequest =
  async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER}::text, 0))`,
    );
    await transaction.execute(
      sql`select graphile_worker.add_job(
        ${OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER}::text,
        '{}'::json,
        job_key => ${OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER}::text,
        job_key_mode => 'replace',
        priority => ${REQUEST_PRIORITY}::int,
        max_attempts => ${REQUEST_MAX_ATTEMPTS}::int
      )
      where not exists (
        select 1 from graphile_worker.jobs
        where key = ${OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER}::text
          and attempts < max_attempts
      )`,
    );
  };
