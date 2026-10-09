import { MERCADO_PAGO_PENDING_CHECK_INTERVAL_MS } from "@purosur/domain";
import {
  checkPendingMercadoPagoPayments,
  type MercadoPagoOrders,
} from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackgroundJobs } from "../platform/background-jobs.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { DrizzlePaymentTransactionDirectory } from "./drizzle-payment-transaction-directory.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";

export const MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER = "mercado-pago-pending-check";
export const MERCADO_PAGO_PENDING_CHECK_WATCHDOG_TASK_IDENTIFIER =
  "mercado-pago-pending-check-watchdog";

const WATCHDOG_CRONTAB_LINE = `* * * * * ${MERCADO_PAGO_PENDING_CHECK_WATCHDOG_TASK_IDENTIFIER}`;

export interface MercadoPagoPendingCheckInput<TQueryResult extends PgQueryResultHKT> {
  now: () => Date;
  mercadoPago: MercadoPagoOrders;
  db: PgDatabase<TQueryResult>;
  connections: DedicatedConnections<TQueryResult>;
}

function checkPendingPayments<TQueryResult extends PgQueryResultHKT>({
  now,
  mercadoPago,
  db,
  connections,
}: MercadoPagoPendingCheckInput<TQueryResult>) {
  return checkPendingMercadoPagoPayments({
    directory: new DrizzlePaymentTransactionDirectory(db),
    lanes: new DrizzlePaymentTransactionLanes(connections),
    mercadoPago,
    clock: { now },
  });
}

export interface MercadoPagoPendingCheckJobsDeps {
  check?: () => Promise<unknown>;
}

export function mercadoPagoPendingCheckJobs<TQueryResult extends PgQueryResultHKT>(
  input: MercadoPagoPendingCheckInput<TQueryResult>,
  deps: MercadoPagoPendingCheckJobsDeps = {},
): BackgroundJobs {
  const check = deps.check ?? (() => checkPendingPayments(input));
  return {
    taskList: {
      [MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER]: async (_payload, helpers) => {
        try {
          await check();
        } finally {
          await helpers.addJob(
            MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
            {},
            {
              jobKey: MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
              jobKeyMode: "replace",
              runAt: new Date(input.now().getTime() + MERCADO_PAGO_PENDING_CHECK_INTERVAL_MS),
            },
          );
        }
      },
      [MERCADO_PAGO_PENDING_CHECK_WATCHDOG_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.addJob(
          MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
          {},
          { jobKey: MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER, jobKeyMode: "preserve_run_at" },
        );
      },
    },
    crontab: [WATCHDOG_CRONTAB_LINE],
  };
}
