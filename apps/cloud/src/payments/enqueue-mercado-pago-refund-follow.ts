import type { SqlExecutor } from "../fiscal/enqueue-unclear-outcome.js";

export type EnqueueMercadoPagoRefundFollow = (transaction: SqlExecutor) => Promise<void>;
