import { UNCLEAR_ANSWER_KINDS } from "@purosur/domain";
import { sql } from "drizzle-orm";
import type {
  EnqueueUnclearOutcome,
  SqlExecutor,
  WithdrawUnclearOutcome,
} from "./enqueue-unclear-outcome.js";
import {
  UNCLEAR_OUTCOME_PRIORITY,
  UNCLEAR_OUTCOME_TASK_IDENTIFIER,
  unclearOutcomeJobKey,
} from "./unclear-outcome-task.js";

// graphile-worker's JavaScript `addJob` runs on its own pool, so it cannot join the transaction
// that records the answer; its SQL function can. The job key keeps one pending job per document.
export const enqueueUnclearOutcomeJob: EnqueueUnclearOutcome = async (
  transaction,
  fiscalDocumentId,
  runAt,
) => {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      ${UNCLEAR_OUTCOME_TASK_IDENTIFIER}::text,
      ${JSON.stringify({ fiscalDocumentId })}::json,
      job_key => ${unclearOutcomeJobKey(fiscalDocumentId)}::text,
      run_at => ${runAt.toISOString()}::timestamptz,
      priority => ${UNCLEAR_OUTCOME_PRIORITY}::int
    )`,
  );
};

export const withdrawUnclearOutcomeJob: WithdrawUnclearOutcome = async (
  transaction,
  fiscalDocumentId,
) => {
  await transaction.execute(
    sql`select graphile_worker.remove_job(${unclearOutcomeJobKey(fiscalDocumentId)}::text)`,
  );
};

// A job that used up its attempts is not retried by the worker, and a document can be waiting for an
// answer that a restart cut short, so startup asks again for every document that still needs a
// decision. A job already waiting for its next ask keeps the time it is due.
export async function enqueueMissingUnclearOutcomes(transaction: SqlExecutor): Promise<void> {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      ${UNCLEAR_OUTCOME_TASK_IDENTIFIER}::text,
      json_build_object('fiscalDocumentId', request.fiscal_document_id),
      job_key => ${UNCLEAR_OUTCOME_TASK_IDENTIFIER}::text || ':' || request.fiscal_document_id,
      job_key_mode => 'preserve_run_at',
      priority => ${UNCLEAR_OUTCOME_PRIORITY}::int
    )
    from fiscal_requests request
    where request.decision is null
      and (request.answer_kind is null or request.answer_kind in (${sql.join(
        UNCLEAR_ANSWER_KINDS.map((kind) => sql`${kind}`),
        sql`, `,
      )}))`,
  );
}
