import { MERCADO_PAGO_REFUND_FOLLOW_INTERVAL_MS } from "@purosur/domain";
import {
  followMercadoPagoRefunds,
  type MercadoPagoOrders,
} from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackgroundJobs } from "../platform/background-jobs.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { DrizzleMercadoPagoRefundStore } from "./drizzle-mercado-pago-refund-store.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";
import { randomMercadoPagoRefundKeys } from "./mercado-pago-refund-keys.js";

export const MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER = "mercado-pago-refund-follow";
export const MERCADO_PAGO_REFUND_FOLLOW_WATCHDOG_TASK_IDENTIFIER =
  "mercado-pago-refund-follow-watchdog";

const WATCHDOG_CRONTAB_LINE = `* * * * * ${MERCADO_PAGO_REFUND_FOLLOW_WATCHDOG_TASK_IDENTIFIER}`;

export interface MercadoPagoRefundFollowInput<TQueryResult extends PgQueryResultHKT> {
  now: () => Date;
  mercadoPago: MercadoPagoOrders;
  db: PgDatabase<TQueryResult>;
  connections: DedicatedConnections<TQueryResult>;
}

function followRefunds<TQueryResult extends PgQueryResultHKT>({
  now,
  mercadoPago,
  db,
  connections,
}: MercadoPagoRefundFollowInput<TQueryResult>) {
  return followMercadoPagoRefunds({
    store: new DrizzleMercadoPagoRefundStore(db),
    lanes: new DrizzlePaymentTransactionLanes(connections),
    mercadoPago,
    refundKeys: randomMercadoPagoRefundKeys,
    clock: { now },
  });
}

export interface MercadoPagoRefundFollowJobsDeps {
  follow?: () => Promise<unknown>;
}

export function mercadoPagoRefundFollowJobs<TQueryResult extends PgQueryResultHKT>(
  input: MercadoPagoRefundFollowInput<TQueryResult>,
  deps: MercadoPagoRefundFollowJobsDeps = {},
): BackgroundJobs {
  const follow = deps.follow ?? (() => followRefunds(input));
  return {
    taskList: {
      [MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER]: async (_payload, helpers) => {
        try {
          await follow();
        } finally {
          await helpers.addJob(
            MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER,
            {},
            {
              jobKey: MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER,
              jobKeyMode: "replace",
              runAt: new Date(input.now().getTime() + MERCADO_PAGO_REFUND_FOLLOW_INTERVAL_MS),
            },
          );
        }
      },
      [MERCADO_PAGO_REFUND_FOLLOW_WATCHDOG_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.addJob(
          MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER,
          {},
          { jobKey: MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER, jobKeyMode: "preserve_run_at" },
        );
      },
    },
    crontab: [WATCHDOG_CRONTAB_LINE],
  };
}
