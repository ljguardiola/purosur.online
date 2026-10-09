import { type SQL, sql } from "drizzle-orm";
import { TAX_AUTHORITY_COUNT_TASK_IDENTIFIER } from "./tax-authority-count-task.js";

interface SqlExecutor {
  execute(query: SQL): PromiseLike<unknown>;
}

export type EnqueueTaxAuthorityCount = (
  transaction: SqlExecutor,
  pointOfSale: number,
) => Promise<void>;

// graphile-worker's JavaScript `addJob` runs on its own pool, so it cannot join the
// configuration's transaction; its SQL function can. The job key keeps one pending job per
// point of sale. The job keeps graphile-worker's default of 25 attempts, spaced by its
// exponential backoff.
export const enqueueTaxAuthorityCountJob: EnqueueTaxAuthorityCount = async (
  transaction,
  pointOfSale,
) => {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      ${TAX_AUTHORITY_COUNT_TASK_IDENTIFIER},
      ${JSON.stringify({ pointOfSale })}::json,
      job_key => ${`${TAX_AUTHORITY_COUNT_TASK_IDENTIFIER}:${pointOfSale}`}
    )`,
  );
};

// A job that used up its attempts is not retried by the worker, so startup asks again for every
// claimed point of sale whose count was never read.
export async function enqueueMissingTaxAuthorityCounts(transaction: SqlExecutor): Promise<void> {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      ${TAX_AUTHORITY_COUNT_TASK_IDENTIFIER}::text,
      json_build_object('pointOfSale', claim.point_of_sale_number),
      job_key => ${TAX_AUTHORITY_COUNT_TASK_IDENTIFIER}::text || ':' || claim.point_of_sale_number
    )
    from point_of_sale_claims claim
    where not exists (
      select 1 from tax_authority_last_authorized_numbers count
      where count.point_of_sale_number = claim.point_of_sale_number
    )`,
  );
}
