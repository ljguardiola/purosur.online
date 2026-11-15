import { type AlertEmailSender, sendDueAlertEmails } from "@purosur/domain/alerts/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleAlertEmailBranchReader } from "../branch/drizzle-alert-email-branch-reader.js";
import { type BackgroundJobs, crontabLineEvery } from "../platform/background-jobs.js";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { DrizzleAlertEmailRecipientReader } from "../users/drizzle-alert-email-recipient-reader.js";
import { DrizzleAlertEmailLanes } from "./drizzle-alert-email-lanes.js";

export const ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER = "alert-email-delivery";

const ALERT_EMAIL_DELIVERY_INTERVAL_MS = 60 * 1000;

export interface AlertEmailDeliveryInput<TQueryResult extends PgQueryResultHKT> {
  now: () => Date;
  sender: AlertEmailSender;
  db: PgDatabase<TQueryResult>;
  connections: DedicatedConnections<TQueryResult>;
}

export function alertEmailDeliveryJobs<TQueryResult extends PgQueryResultHKT>({
  now,
  sender,
  db,
  connections,
}: AlertEmailDeliveryInput<TQueryResult>): BackgroundJobs {
  return {
    taskList: {
      [ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER]: async (_payload, helpers) => {
        const outcome = await sendDueAlertEmails({
          lanes: new DrizzleAlertEmailLanes(connections),
          recipients: new DrizzleAlertEmailRecipientReader(db),
          branches: new DrizzleAlertEmailBranchReader(db),
          sender,
          clock: { now },
        });
        helpers.logger.info(
          outcome.kind === "lane_busy"
            ? "Alert emails: another run is still sending them"
            : `Alert emails: ${outcome.sent} sent, ${outcome.retrying} retrying, ${outcome.failed} failed, ${outcome.skipped} skipped`,
        );
      },
    },
    crontab: [
      crontabLineEvery(ALERT_EMAIL_DELIVERY_INTERVAL_MS, ALERT_EMAIL_DELIVERY_TASK_IDENTIFIER),
    ],
  };
}
