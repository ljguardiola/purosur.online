import { ALERT_CONDITION_EVALUATION_INTERVAL_MS } from "@purosur/domain";
import {
  detectExpiringLots,
  detectFortnightReportDeadlines,
  detectFortnightReportRegularizations,
  detectMissingOfflineAuthorizationCodes,
  detectOwedElsewherePresentations,
  detectQuietRegisters,
  openOverdueUnclearOutcomeAlerts,
  resolveStablyClearedAlerts,
} from "@purosur/domain/alerts/use-cases";
import { openOverdueRefundTaskAlerts } from "@purosur/domain/payments/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { DrizzleBranchExpiryWindowReader } from "../branch/drizzle-branch-expiry-window-reader.js";
import { DrizzleBranchHoursReader } from "../branch/drizzle-branch-hours-reader.js";
import { DrizzleFortnightRegularizationReader } from "../fiscal/drizzle-fortnight-regularization-reader.js";
import { DrizzleOfflineAuthorizationCodeHoldingReader } from "../fiscal/drizzle-offline-authorization-code-holding-reader.js";
import { DrizzleOwedElsewherePresentationReader } from "../fiscal/drizzle-owed-elsewhere-presentation-reader.js";
import { DrizzleOwedFortnightPresentationReader } from "../fiscal/drizzle-owed-fortnight-presentation-reader.js";
import { DrizzleRefundTaskAlertStore } from "../payments/drizzle-refund-task-alert-store.js";
import {
  type BackgroundJobs,
  crontabLineEvery,
  databaseOfClient,
} from "../platform/background-jobs.js";
import { DrizzleWatchedRegisterReader } from "../register/drizzle-watched-register-reader.js";
import { hashSourceAddress } from "../sessions/sign-in-lockout.js";
import { DrizzleExpiringLotReader } from "../stock/drizzle-expiring-lot-reader.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { DrizzleExpiringLotAlerts } from "./drizzle-expiring-lot-alerts.js";
import { DrizzleFortnightReportDeadlineAlerts } from "./drizzle-fortnight-report-deadline-alerts.js";
import { DrizzleFortnightReportRegularizationAlerts } from "./drizzle-fortnight-report-regularization-alerts.js";
import { DrizzleMissingOfflineAuthorizationCodeAlerts } from "./drizzle-missing-offline-authorization-code-alerts.js";
import { DrizzleOwedElsewhereAlerts } from "./drizzle-owed-elsewhere-alerts.js";
import { DrizzleUnclearOutcomeAlertStore } from "./drizzle-unclear-outcome-alert-store.js";

export const ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER = "alert-condition-resolution";

function resolveClearedConditionAlertsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return resolveStablyClearedAlerts({
    store: new DrizzleAlertStore(db, deps.now),
    clock: { now: deps.now },
    hasher: { hash: hashSourceAddress },
  });
}

function detectQuietRegistersTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return detectQuietRegisters({
    registers: new DrizzleWatchedRegisterReader(db),
    branchHours: new DrizzleBranchHoursReader(db),
    store: new DrizzleAlertStore(db, deps.now),
    clock: { now: deps.now },
    hasher: { hash: hashSourceAddress },
  });
}

function detectMissingOfflineAuthorizationCodesTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return detectMissingOfflineAuthorizationCodes({
    holdings: new DrizzleOfflineAuthorizationCodeHoldingReader(db),
    alerts: new DrizzleMissingOfflineAuthorizationCodeAlerts(db, deps.now),
    clock: { now: deps.now },
  });
}

function openRefundTaskAlertsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
) {
  return openOverdueRefundTaskAlerts({
    store: new DrizzleRefundTaskAlertStore(db),
    clock: { now: deps.now },
  });
}

function openUnclearOutcomeAlertsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
) {
  return openOverdueUnclearOutcomeAlerts({
    store: new DrizzleUnclearOutcomeAlertStore(db),
    clock: { now: deps.now },
  });
}

function detectExpiringLotsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return detectExpiringLots({
    branches: new DrizzleBranchExpiryWindowReader(db),
    lots: new DrizzleExpiringLotReader(db),
    alerts: new DrizzleExpiringLotAlerts(db, deps.now),
    clock: { now: deps.now },
  });
}

function detectFortnightReportDeadlinesTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return detectFortnightReportDeadlines({
    presentations: new DrizzleOwedFortnightPresentationReader(db),
    alerts: new DrizzleFortnightReportDeadlineAlerts(db, deps.now),
    clock: { now: deps.now },
  });
}

function detectOwedElsewherePresentationsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return detectOwedElsewherePresentations({
    presentations: new DrizzleOwedElsewherePresentationReader(db),
    alerts: new DrizzleOwedElsewhereAlerts(db, deps.now),
  });
}

function detectFortnightReportRegularizationsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: { now: () => Date },
): Promise<number> {
  return detectFortnightReportRegularizations({
    presentations: new DrizzleFortnightRegularizationReader(db),
    alerts: new DrizzleFortnightReportRegularizationAlerts(db, deps.now),
  });
}

export interface AlertConditionResolutionJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  resolve?: typeof resolveClearedConditionAlertsTask;
  detectQuiet?: typeof detectQuietRegistersTask;
  detectMissingCodes?: typeof detectMissingOfflineAuthorizationCodesTask;
  openRefundTaskAlerts?: typeof openRefundTaskAlertsTask;
  openUnclearOutcomeAlerts?: typeof openUnclearOutcomeAlertsTask;
  detectExpiringLots?: typeof detectExpiringLotsTask;
  detectFortnightReportDeadlines?: typeof detectFortnightReportDeadlinesTask;
  detectFortnightReportRegularizations?: typeof detectFortnightReportRegularizationsTask;
  detectOwedElsewherePresentations?: typeof detectOwedElsewherePresentationsTask;
}

export function alertConditionResolutionJobs(
  options: { now: () => Date },
  deps: AlertConditionResolutionJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doResolve = deps.resolve ?? resolveClearedConditionAlertsTask;
  const doDetectQuiet = deps.detectQuiet ?? detectQuietRegistersTask;
  const doDetectMissingCodes =
    deps.detectMissingCodes ?? detectMissingOfflineAuthorizationCodesTask;
  const doOpenRefundTaskAlerts = deps.openRefundTaskAlerts ?? openRefundTaskAlertsTask;
  const doOpenUnclearOutcomeAlerts = deps.openUnclearOutcomeAlerts ?? openUnclearOutcomeAlertsTask;
  const doDetectExpiringLots = deps.detectExpiringLots ?? detectExpiringLotsTask;
  const doDetectFortnightReportDeadlines =
    deps.detectFortnightReportDeadlines ?? detectFortnightReportDeadlinesTask;
  const doDetectOwedElsewherePresentations =
    deps.detectOwedElsewherePresentations ?? detectOwedElsewherePresentationsTask;
  const doDetectFortnightReportRegularizations =
    deps.detectFortnightReportRegularizations ?? detectFortnightReportRegularizationsTask;
  return {
    taskList: {
      [ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient(async (client) => {
          const db = doCreateDatabase(client);
          await doResolve(db, { now: options.now });
          await doDetectQuiet(db, { now: options.now });
          await doDetectMissingCodes(db, { now: options.now });
          await doOpenRefundTaskAlerts(db, { now: options.now });
          await doOpenUnclearOutcomeAlerts(db, { now: options.now });
          await doDetectExpiringLots(db, { now: options.now });
          await doDetectFortnightReportDeadlines(db, { now: options.now });
          await doDetectOwedElsewherePresentations(db, { now: options.now });
          await doDetectFortnightReportRegularizations(db, { now: options.now });
        });
      },
    },
    crontab: [
      crontabLineEvery(
        ALERT_CONDITION_EVALUATION_INTERVAL_MS,
        ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER,
      ),
    ],
  };
}
