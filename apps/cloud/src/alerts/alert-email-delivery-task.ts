import { type AlertEmailSender, sendDueAlertEmails } from "@purosur/domain/alerts/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import { type BackgroundJobs, crontabLineEvery } from "../platform/background-jobs.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { DrizzleAlertEmailLanes } from "./drizzle-alert-email-lanes.js";

export const ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER = "alert-email-delivery";

const ALERT_EMAIL_DELIVERY_INTERVAL_MS = 60 * 1000;

export interface AlertEmailDeliveryInput<TQueryResult extends PgQueryResultHKT> {
  now: () => Date;
  sender: AlertEmailSender;
  connections: DedicatedConnections<TQueryResult>;
}

export function alertEmailDeliveryJobs<TQueryResult extends PgQueryResultHKT>({
  now,
  sender,
  connections,
}: AlertEmailDeliveryInput<TQueryResult>): BackgroundJobs {
  return {
    taskList: {
      [ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER]: async (_payload, helpers) => {
        const outcome = await sendDueAlertEmails({
          lanes: new DrizzleAlertEmailLanes(connections),
          sender,
          clock: { now },
        });
        helpers.logger.info(
          `Alert emails: ${outcome.sent} sent, ${outcome.retrying} retrying, ${outcome.failed} failed`,
        );
      },
    },
    crontab: [
      crontabLineEvery(ALERT_EMAIL_DELIVERY_INTERVAL_MS, ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER),
    ],
  };
}
