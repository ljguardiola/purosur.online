import type { QueuedFirstPinCodeEmail } from "@purosur/domain/access/use-cases";
import { type SQL, sql } from "drizzle-orm";
import { FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER } from "./recovery-worker.js";
import type { FirstPinCodeEmailJobPayload } from "./send-first-pin-code-email-job.js";

export interface SqlExecutor {
  execute(query: SQL): PromiseLike<unknown>;
}

export type EnqueueFirstPinCodeEmail = (
  transaction: SqlExecutor,
  email: QueuedFirstPinCodeEmail,
) => Promise<void>;

// graphile-worker's JavaScript `addJob` runs on its own pool, so it cannot join the emission's
// transaction; its SQL function can.
export const enqueueFirstPinCodeEmailJob: EnqueueFirstPinCodeEmail = async (
  transaction,
  { email, code, expiresAt },
) => {
  const payload: FirstPinCodeEmailJobPayload = { email, code, expiresAt: expiresAt.toISOString() };
  await transaction.execute(
    sql`select graphile_worker.add_job(${FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER}, ${JSON.stringify(payload)}::json)`,
  );
};
