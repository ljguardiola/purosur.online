import { ALERT_CONDITION_EVALUATION_INTERVAL_MS, type ZoneRulesSource } from "@purosur/domain";
import {
  detectDeferredSaleDeadlines,
  detectExceptionShareBreaches,
  detectExpiringLots,
  detectFortnightReportDeadlines,
  detectFortnightReportRegularizations,
  detectMissingOfflineAuthorizationCodes,
  detectOwedElsewherePresentations,
  detectQuietRegisters,
  detectRejectedFortnightDocuments,
  detectSecondNonCompliantMonthRisks,
  openOverdueUnclearOutcomeAlerts,
  resolveStablyClearedAlerts,
} from "@purosur/domain/alerts/use-cases";
import { detectOverdueRegisterBackups } from "@purosur/domain/backups/use-cases";
import {
  recordExceptionShareBreaches,
  regularizeUninvoiceableDeferredSales,
} from "@purosur/domain/fiscal/use-cases";
import { openOverdueRefundTaskAlerts } from "@purosur/domain/payments/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { DrizzleRegisterBackupStandingReader } from "../backups/drizzle-register-backup-standing-reader.js";
import { DrizzleBranchExpiryWindowReader } from "../branch/drizzle-branch-expiry-window-reader.js";
import { DrizzleBranchHoursReader } from "../branch/drizzle-branch-hours-reader.js";
import { DrizzleDeferredSaleExpiryStore } from "../fiscal/drizzle-deferred-sale-expiry-store.js";
import { DrizzleExceptionShareBreachStore } from "../fiscal/drizzle-exception-share-breach-store.js";
import { DrizzleFortnightRegularizationReader } from "../fiscal/drizzle-fortnight-regularization-reader.js";
import { DrizzleOfflineAuthorizationCodeHoldingReader } from "../fiscal/drizzle-offline-authorization-code-holding-reader.js";
import { DrizzleOwedElsewherePresentationReader } from "../fiscal/drizzle-owed-elsewhere-presentation-reader.js";
import { DrizzleOwedFortnightPresentationReader } from "../fiscal/drizzle-owed-fortnight-presentation-reader.js";
import { DrizzlePendingDeferredSaleReader } from "../fiscal/drizzle-pending-deferred-sale-reader.js";
import { DrizzleRejectedFortnightDocumentReader } from "../fiscal/drizzle-rejected-fortnight-document-reader.js";
import { DrizzleRefundTaskAlertStore } from "../payments/drizzle-refund-task-alert-store.js";
import {
  type BackgroundJobs,
  crontabLineEvery,
  databaseOfClient,
} from "../platform/background-jobs.js";
import { DrizzleWatchedRegisterReader } from "../register/drizzle-watched-register-reader.js";
import { hashSourceAddress } from "../sessions/sign-in-lockout.js";
import { DrizzleExpiringLotReader } from "../stock/drizzle-expiring-lot-reader.js";
import { DrizzleRegisterEventStreams } from "../sync/drizzle-register-event-streams.js";
import { DrizzleAlertStore } from "./drizzle-alert-store.js";
import { DrizzleDeferredSaleDueAlerts } from "./drizzle-deferred-sale-due-alerts.js";
import { DrizzleExceptionShareBreachAlerts } from "./drizzle-exception-share-breach-alerts.js";
import { DrizzleExpiringLotAlerts } from "./drizzle-expiring-lot-alerts.js";
import { DrizzleFortnightReportDeadlineAlerts } from "./drizzle-fortnight-report-deadline-alerts.js";
import { DrizzleFortnightReportRegularizationAlerts } from "./drizzle-fortnight-report-regularization-alerts.js";
import { DrizzleMissingOfflineAuthorizationCodeAlerts } from "./drizzle-missing-offline-authorization-code-alerts.js";
import { DrizzleOwedElsewhereAlerts } from "./drizzle-owed-elsewhere-alerts.js";
import { DrizzleRecordedExceptionShareBreachReader } from "./drizzle-recorded-exception-share-breach-reader.js";
import { DrizzleRejectedFortnightDocumentAlerts } from "./drizzle-rejected-fortnight-document-alerts.js";
import { DrizzleSecondMonthAtRiskAlerts } from "./drizzle-second-month-at-risk-alerts.js";
import { DrizzleSecondMonthRiskReader } from "./drizzle-second-month-risk-reader.js";
import { DrizzleUnclearOutcomeAlertStore } from "./drizzle-unclear-outcome-alert-store.js";
import { observeAlertCondition } from "./observe-alert-condition.js";

export const ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER = "alert-condition-resolution";

interface AlertTaskDeps {
  now: () => Date;
  zoneRules: ZoneRulesSource;
}

function resolveClearedConditionAlertsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return resolveStablyClearedAlerts({
    store: new DrizzleAlertStore(db, deps.now),
    clock: { now: deps.now },
    hasher: { hash: hashSourceAddress },
  });
}

function detectQuietRegistersTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectQuietRegisters({
    registers: new DrizzleWatchedRegisterReader(db),
    branchHours: new DrizzleBranchHoursReader(db),
    store: new DrizzleAlertStore(db, deps.now),
    clock: { now: deps.now },
    zoneRules: deps.zoneRules,
    hasher: { hash: hashSourceAddress },
  });
}

function detectMissingOfflineAuthorizationCodesTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectMissingOfflineAuthorizationCodes({
    holdings: new DrizzleOfflineAuthorizationCodeHoldingReader(db),
    alerts: new DrizzleMissingOfflineAuthorizationCodeAlerts(db, deps.now),
    clock: { now: deps.now },
    zoneRules: deps.zoneRules,
  });
}

function openRefundTaskAlertsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
) {
  return openOverdueRefundTaskAlerts({
    store: new DrizzleRefundTaskAlertStore(db),
    clock: { now: deps.now },
  });
}

function openUnclearOutcomeAlertsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
) {
  return openOverdueUnclearOutcomeAlerts({
    store: new DrizzleUnclearOutcomeAlertStore(db),
    clock: { now: deps.now },
  });
}

function detectExpiringLotsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectExpiringLots({
    branches: new DrizzleBranchExpiryWindowReader(db),
    lots: new DrizzleExpiringLotReader(db),
    alerts: new DrizzleExpiringLotAlerts(db, deps.now),
    clock: { now: deps.now },
    zoneRules: deps.zoneRules,
  });
}

function detectFortnightReportDeadlinesTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectFortnightReportDeadlines({
    presentations: new DrizzleOwedFortnightPresentationReader(
      db,
      new DrizzleRegisterEventStreams(db),
      deps.zoneRules,
    ),
    alerts: new DrizzleFortnightReportDeadlineAlerts(db, deps.now),
    clock: { now: deps.now },
    zoneRules: deps.zoneRules,
  });
}

function detectOwedElsewherePresentationsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectOwedElsewherePresentations({
    presentations: new DrizzleOwedElsewherePresentationReader(db),
    alerts: new DrizzleOwedElsewhereAlerts(db, deps.now),
  });
}

function detectFortnightReportRegularizationsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectFortnightReportRegularizations({
    presentations: new DrizzleFortnightRegularizationReader(db),
    alerts: new DrizzleFortnightReportRegularizationAlerts(db, deps.now),
  });
}

function detectRejectedFortnightDocumentsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectRejectedFortnightDocuments({
    presentations: new DrizzleRejectedFortnightDocumentReader(db),
    alerts: new DrizzleRejectedFortnightDocumentAlerts(db, deps.now),
  });
}

function detectOverdueRegisterBackupsTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectOverdueRegisterBackups({
    standings: new DrizzleRegisterBackupStandingReader(db),
    alerts: {
      observeAlertCondition: async (observation) => {
        await observeAlertCondition(db, observation, { now: deps.now });
      },
    },
    clock: { now: deps.now },
  });
}

function regularizeUninvoiceableDeferredSalesTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
) {
  return regularizeUninvoiceableDeferredSales({
    store: new DrizzleDeferredSaleExpiryStore(db),
    clock: { now: deps.now },
    zoneRules: deps.zoneRules,
  });
}

async function detectDeferredSaleDeadlinesTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectDeferredSaleDeadlines(
    {
      alerts: new DrizzleDeferredSaleDueAlerts(db, deps.now),
      clock: { now: deps.now },
      zoneRules: deps.zoneRules,
    },
    await new DrizzlePendingDeferredSaleReader(db).pendingDeferredSales(),
  );
}

function recordExceptionShareBreachesTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
) {
  return recordExceptionShareBreaches({
    store: new DrizzleExceptionShareBreachStore(db, deps.now),
    clock: { now: deps.now },
    zoneRules: deps.zoneRules,
  });
}

function detectExceptionShareBreachesTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectExceptionShareBreaches({
    breaches: new DrizzleRecordedExceptionShareBreachReader(db),
    alerts: new DrizzleExceptionShareBreachAlerts(db, deps.now),
  });
}

function detectSecondMonthRisksTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  deps: AlertTaskDeps,
): Promise<number> {
  return detectSecondNonCompliantMonthRisks({
    risks: new DrizzleSecondMonthRiskReader(db),
    alerts: new DrizzleSecondMonthAtRiskAlerts(db, deps.now),
    clock: { now: deps.now },
    zoneRules: deps.zoneRules,
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
  detectRejectedFortnightDocuments?: typeof detectRejectedFortnightDocumentsTask;
  detectOverdueRegisterBackups?: typeof detectOverdueRegisterBackupsTask;
  regularizeUninvoiceableDeferredSales?: typeof regularizeUninvoiceableDeferredSalesTask;
  detectDeferredSaleDeadlines?: typeof detectDeferredSaleDeadlinesTask;
  recordExceptionShareBreaches?: typeof recordExceptionShareBreachesTask;
  detectExceptionShareBreaches?: typeof detectExceptionShareBreachesTask;
  detectSecondMonthRisks?: typeof detectSecondMonthRisksTask;
}

export function alertConditionResolutionJobs(
  options: AlertTaskDeps,
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
  const doDetectRejectedFortnightDocuments =
    deps.detectRejectedFortnightDocuments ?? detectRejectedFortnightDocumentsTask;
  const doDetectOverdueRegisterBackups =
    deps.detectOverdueRegisterBackups ?? detectOverdueRegisterBackupsTask;
  const doRegularizeUninvoiceableDeferredSales =
    deps.regularizeUninvoiceableDeferredSales ?? regularizeUninvoiceableDeferredSalesTask;
  const doDetectDeferredSaleDeadlines =
    deps.detectDeferredSaleDeadlines ?? detectDeferredSaleDeadlinesTask;
  const doRecordExceptionShareBreaches =
    deps.recordExceptionShareBreaches ?? recordExceptionShareBreachesTask;
  const doDetectExceptionShareBreaches =
    deps.detectExceptionShareBreaches ?? detectExceptionShareBreachesTask;
  const doDetectSecondMonthRisks = deps.detectSecondMonthRisks ?? detectSecondMonthRisksTask;
  return {
    taskList: {
      [ALERT_CONDITION_RESOLUTION_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient(async (client) => {
          const db = doCreateDatabase(client);
          await doResolve(db, { now: options.now, zoneRules: options.zoneRules });
          await doDetectQuiet(db, { now: options.now, zoneRules: options.zoneRules });
          await doDetectMissingCodes(db, { now: options.now, zoneRules: options.zoneRules });
          await doOpenRefundTaskAlerts(db, { now: options.now, zoneRules: options.zoneRules });
          await doOpenUnclearOutcomeAlerts(db, { now: options.now, zoneRules: options.zoneRules });
          await doDetectExpiringLots(db, { now: options.now, zoneRules: options.zoneRules });
          await doDetectFortnightReportDeadlines(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
          await doDetectOwedElsewherePresentations(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
          await doDetectFortnightReportRegularizations(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
          await doDetectRejectedFortnightDocuments(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
          await doDetectOverdueRegisterBackups(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
          await doRegularizeUninvoiceableDeferredSales(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
          await doDetectDeferredSaleDeadlines(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
          await doRecordExceptionShareBreaches(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
          await doDetectExceptionShareBreaches(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
          await doDetectSecondMonthRisks(db, {
            now: options.now,
            zoneRules: options.zoneRules,
          });
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
