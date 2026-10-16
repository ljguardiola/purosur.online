import { sql } from "drizzle-orm";
import type { EnqueueOrphanCreditNote } from "./enqueue-orphan-credit-note.js";
import type { SqlExecutor } from "./enqueue-unclear-outcome.js";
import {
  ORPHAN_CREDIT_NOTE_PRIORITY,
  ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER,
  orphanCreditNoteJobKey,
} from "./orphan-credit-note-task.js";

// graphile-worker's JavaScript `addJob` runs on its own pool, so it cannot join the transaction
// that records the credit note; its SQL function can. The job key keeps one pending job per credit
// note.
export const enqueueOrphanCreditNoteJob: EnqueueOrphanCreditNote = async (
  transaction,
  creditNoteId,
) => {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      ${ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER}::text,
      ${JSON.stringify({ creditNoteId })}::json,
      job_key => ${orphanCreditNoteJobKey(creditNoteId)}::text,
      priority => ${ORPHAN_CREDIT_NOTE_PRIORITY}::int
    )`,
  );
};

// A job that used up its attempts is not retried by the worker, so startup asks again for every
// credit note still waiting for its answer. A job already waiting keeps the time it is due.
export async function enqueueMissingOrphanCreditNotes(transaction: SqlExecutor): Promise<void> {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      ${ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER}::text,
      json_build_object('creditNoteId', note.id),
      job_key => ${ORPHAN_CREDIT_NOTE_TASK_IDENTIFIER}::text || ':' || note.id,
      job_key_mode => 'preserve_run_at',
      priority => ${ORPHAN_CREDIT_NOTE_PRIORITY}::int
    )
    from orphan_credit_notes note
    where note.answer_kind is null or note.answer_kind = 'unclear'`,
  );
}
