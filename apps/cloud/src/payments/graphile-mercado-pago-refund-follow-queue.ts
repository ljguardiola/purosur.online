import { sql } from "drizzle-orm";
import type { EnqueueMercadoPagoRefundFollow } from "./enqueue-mercado-pago-refund-follow.js";
import { MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER } from "./mercado-pago-refund-follow-task.js";

// graphile-worker's JavaScript `addJob` runs on its own pool, so it cannot join the transaction
// that records the refund; its SQL function can. The key is the one the follow reschedules itself
// with, so this brings the next run forward instead of adding a second chain.
export const enqueueMercadoPagoRefundFollowJob: EnqueueMercadoPagoRefundFollow = async (
  transaction,
) => {
  await transaction.execute(
    sql`select graphile_worker.add_job(
      ${MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER}::text,
      '{}'::json,
      job_key => ${MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER}::text,
      job_key_mode => 'replace'
    )`,
  );
};
