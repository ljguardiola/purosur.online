import { awaitsNumberingDiagnosis } from "@purosur/domain";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { fiscalRequests } from "../platform/db/schema.js";
import type {
  EnqueueNumberingDiagnosis,
  EnqueueNumberingReconciliation,
} from "./enqueue-numbering-conflict.js";
import { answerOf } from "./fiscal-request-answer.js";
import { diagnosisOf } from "./fiscal-request-diagnosis.js";
import {
  DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER,
  NUMBERING_CONFLICT_PRIORITY,
  numberingDiagnosisJobKey,
  numberingReconciliationJobKey,
  RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER,
} from "./numbering-conflict-task.js";

// graphile-worker's JavaScript `addJob` runs on its own pool, so it cannot join the transaction
// that records the answer; its SQL function can. The job key keeps one pending job per document.
export const enqueueNumberingDiagnosisJob: EnqueueNumberingDiagnosis = async (
  transaction,
  fiscalDocumentId,
) => {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      ${DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER}::text,
      ${JSON.stringify({ fiscalDocumentId })}::json,
      job_key => ${numberingDiagnosisJobKey(fiscalDocumentId)}::text,
      priority => ${NUMBERING_CONFLICT_PRIORITY}::int
    )`,
  );
};

export const enqueueNumberingReconciliationJob: EnqueueNumberingReconciliation = async (
  transaction,
  pointOfSale,
) => {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      ${RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER}::text,
      ${JSON.stringify({ pointOfSale })}::json,
      job_key => ${numberingReconciliationJobKey(pointOfSale)}::text,
      priority => ${NUMBERING_CONFLICT_PRIORITY}::int
    )`,
  );
};

// A job that used up its attempts is not retried by the worker, and a restart can cut a freeze
// short of its reconciliation, so startup asks again for every point of sale holding a freeze and
// for every numbering conflict still undiagnosed. A job already waiting keeps the time it is due.
export async function enqueueMissingNumberingConflicts<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<void> {
  await db.execute(
    sql`select graphile_worker.add_job(
      ${RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER}::text,
      json_build_object('pointOfSale', held.point_of_sale_number),
      job_key => ${RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER}::text || ':' || held.point_of_sale_number,
      job_key_mode => 'preserve_run_at',
      priority => ${NUMBERING_CONFLICT_PRIORITY}::int
    )
    from numbering_freezes held`,
  );
  const undiagnosed = await db
    .select({
      fiscalDocumentId: fiscalRequests.fiscalDocumentId,
      answerKind: fiscalRequests.answerKind,
      authorizationCode: fiscalRequests.authorizationCode,
      authorizationCodeDueOn: fiscalRequests.authorizationCodeDueOn,
      rejectionCodes: fiscalRequests.rejectionCodes,
      rejectionClass: fiscalRequests.rejectionClass,
      unclearCodes: fiscalRequests.unclearCodes,
      diagnosis: fiscalRequests.diagnosis,
    })
    .from(fiscalRequests)
    .where(and(eq(fiscalRequests.answerKind, "unclear"), isNull(fiscalRequests.diagnosis)));
  for (const row of undiagnosed) {
    const { fiscalDocumentId } = row;
    if (
      awaitsNumberingDiagnosis({
        answer: answerOf(row),
        unclearCodes: row.unclearCodes ?? [],
        diagnosis: diagnosisOf(row.diagnosis),
      })
    ) {
      await db.execute(
        sql`select graphile_worker.add_job(
          ${DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER}::text,
          ${JSON.stringify({ fiscalDocumentId })}::json,
          job_key => ${numberingDiagnosisJobKey(fiscalDocumentId)}::text,
          job_key_mode => 'preserve_run_at',
          priority => ${NUMBERING_CONFLICT_PRIORITY}::int
        )`,
      );
    }
  }
}
