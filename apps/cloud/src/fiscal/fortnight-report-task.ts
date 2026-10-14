import { argentinaCalendarDay } from "@purosur/domain";
import {
  type FortnightPresentation,
  reportFortnights,
  type TaxAuthorityNoMovementDeclarations,
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
import { DrizzleRegisterEventStreams } from "../sync/drizzle-register-event-streams.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import { NoOfflineDocumentsYet } from "./no-offline-documents-yet.js";
import { rejectionsText } from "./offline-authorization-code-acquisition-description.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const FORTNIGHT_REPORT_TASK_IDENTIFIER = "fortnight-report";

const FORTNIGHT_REPORT_INTERVAL_MS = 10 * 60 * 1000;

export interface FortnightReportInput {
  now: () => Date;
  declarations: TaxAuthorityNoMovementDeclarations;
  codeAuthority: TaxAuthorityOfflineAuthorizationCodes;
  certificateFingerprint: string;
}

export interface FortnightReportJobsDeps {
  createDatabase?: (client: PoolClient) => PgDatabase<PgQueryResultHKT>;
  report?: typeof reportError;
}

function describePresentation({
  pointOfSaleNumber,
  fortnight,
  outcome,
}: FortnightPresentation): string {
  const line = `fortnight report of point of sale ${pointOfSaleNumber} for fortnight ${fortnight.start}..${fortnight.end}: ${outcome.kind}`;
  return "rejections" in outcome ? `${line} (${rejectionsText(outcome.rejections)})` : line;
}

export function fortnightReportJobs(
  { now, declarations, codeAuthority, certificateFingerprint }: FortnightReportInput,
  deps: FortnightReportJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const report = deps.report ?? reportError;
  const present = async (client: PoolClient, { logger }: JobHelpers) => {
    const db = doCreateDatabase(client);
    const outcome = await reportFortnights({
      reports: new DrizzleFortnightReportStore(db),
      documents: new NoOfflineDocumentsYet(),
      streams: new DrizzleRegisterEventStreams(db),
      declarations,
      codeStore: new DrizzleOfflineAuthorizationCodeStore(db),
      codeAuthority,
      tokens: new DrizzleWsaaTokenSource(db, { now }, WSFE_SERVICE, certificateFingerprint),
      clock: { now },
    });
    if (outcome.kind === "no_token") {
      logger.debug("fortnight report: no valid token to ask the tax authority with");
      return;
    }
    if (outcome.presentations.length === 0) {
      logger.debug(`fortnight report: nothing owed on ${argentinaCalendarDay(now())}`);
    }
    for (const presentation of outcome.presentations) {
      const line = describePresentation(presentation);
      if (presentation.outcome.kind === "retry_not_due") {
        logger.debug(line);
        continue;
      }
      logger.info(line);
      if (
        presentation.outcome.kind === "refused" ||
        presentation.outcome.kind === "lookup_refused"
      ) {
        report("fiscal: a fortnight report was refused by the tax authority", new Error(line), {
          context: {
            pointOfSaleNumber: presentation.pointOfSaleNumber,
            fortnightStart: presentation.fortnight.start,
            fortnightEnd: presentation.fortnight.end,
            outcome: presentation.outcome.kind,
            rejections: rejectionsText(presentation.outcome.rejections),
          },
        });
      }
    }
  };
  return {
    taskList: {
      [FORTNIGHT_REPORT_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => present(client, helpers));
      },
    },
    crontab: [crontabLineEvery(FORTNIGHT_REPORT_INTERVAL_MS, FORTNIGHT_REPORT_TASK_IDENTIFIER)],
  };
}
