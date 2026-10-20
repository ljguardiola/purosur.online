import {
  acquisitionUrgencyAlertLevel,
  argentinaCalendarDay,
  OFFLINE_AUTHORIZATION_CODE_ACQUISITION_RETRY_INTERVAL_MS,
} from "@purosur/domain";
import {
  currentFortnightCodeAfterObtaining,
  obtainOfflineAuthorizationCodes,
  reportOfflineAuthorizationCodeAcquisitionFailures,
  type TaxAuthorityOfflineAuthorizationCodes,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { JobHelpers } from "graphile-worker";
import type { PoolClient } from "pg";
import {
  type BackgroundJobs,
  crontabLineEvery,
  databaseOfClient,
} from "../platform/background-jobs.js";
import { reportError } from "../platform/error-reporting.js";
import { DrizzleOfflineAuthorizationCodeAcquisitionReports } from "./drizzle-offline-authorization-code-acquisition-reports.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleOwedPresentationList } from "./drizzle-owed-presentation-list.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import {
  describeAcquisition,
  rejectionsText,
} from "./offline-authorization-code-acquisition-description.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER = "offline-authorization-code-acquisition";

export const OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER =
  "offline-authorization-code-request";

export interface OfflineAuthorizationCodeInput {
  now: () => Date;
  taxAuthority: TaxAuthorityOfflineAuthorizationCodes;
  certificateFingerprint: string;
}

export interface OfflineAuthorizationCodeJobsDeps {
  createDatabase?: (client: PoolClient) => PgDatabase<PgQueryResultHKT>;
  report?: typeof reportError;
}

export function offlineAuthorizationCodeJobs(
  { now, taxAuthority, certificateFingerprint }: OfflineAuthorizationCodeInput,
  deps: OfflineAuthorizationCodeJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const report = deps.report ?? reportError;
  const obtain = async (client: PoolClient, { logger }: JobHelpers) => {
    const db = doCreateDatabase(client);
    const outcome = await obtainOfflineAuthorizationCodes({
      store: new DrizzleOfflineAuthorizationCodeStore(db),
      tokens: new DrizzleWsaaTokenSource(db, { now }, WSFE_SERVICE, certificateFingerprint),
      taxAuthority,
      owedPresentations: new DrizzleOwedPresentationList(db),
      clock: { now },
    });
    if (outcome.kind === "no_offline_point_of_sale") {
      logger.debug("offline authorization code acquisition: no offline point of sale");
    } else {
      for (const { fortnight, outcome: fortnightOutcome } of outcome.fortnights) {
        const line = describeAcquisition(fortnight, fortnightOutcome);
        if (fortnightOutcome.kind === "held") {
          logger.debug(line);
        } else {
          logger.info(line);
        }
      }
    }
    await reportOfflineAuthorizationCodeAcquisitionFailures(outcome, {
      store: new DrizzleOfflineAuthorizationCodeAcquisitionReports(db, { now }),
      notifier: {
        failureNeedsAttention: async ({ fortnight, outcome: failure, urgency }) => {
          report(
            "fiscal: an offline authorization code could not be obtained",
            new Error(describeAcquisition(fortnight, failure)),
            {
              context: {
                fortnightStart: fortnight.start,
                fortnightEnd: fortnight.end,
                outcome: failure.kind,
                level: acquisitionUrgencyAlertLevel(urgency),
                ...(failure.kind === "refused"
                  ? { rejections: rejectionsText(failure.rejections) }
                  : {}),
              },
            },
          );
        },
      },
      clock: { now },
    });
    return outcome;
  };
  return {
    taskList: {
      [OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => obtain(client, helpers));
      },
      // Failing while the code is still missing is what makes the worker retry with its backoff.
      [OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER]: async (_payload, helpers) => {
        const outcome = await helpers.withPgClient((client) => obtain(client, helpers));
        if (
          currentFortnightCodeAfterObtaining(outcome, argentinaCalendarDay(now())) === "missing"
        ) {
          throw new Error("the current fortnight's offline authorization code is still missing");
        }
      },
    },
    crontab: [
      crontabLineEvery(
        OFFLINE_AUTHORIZATION_CODE_ACQUISITION_RETRY_INTERVAL_MS,
        OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER,
      ),
    ],
  };
}
