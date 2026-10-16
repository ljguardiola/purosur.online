import type { SQL } from "drizzle-orm";

interface SqlExecutor {
  execute(query: SQL): PromiseLike<unknown>;
}

export type EnqueueMercadoPagoRefundFollow = (transaction: SqlExecutor) => Promise<void>;
