import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hostname, release, version } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import {
  type CoreReadyMessage,
  mainToCoreMessageSchema,
  type QuitRegisterMessage,
} from "@purosur/contracts";
import {
  BATTERY_READ_INTERVAL_MS,
  CRITICAL_BATTERY_PUSH_LIMIT_MS,
  CRITICAL_BATTERY_SALE_RECHECK_MS,
  type CriticalBatteryAction,
  REGISTER_UPDATE_HOLD_LIMIT_MS,
  STORAGE_READ_INTERVAL_MS,
} from "@purosur/domain";
import * as Sentry from "@sentry/electron/utility";
import { net } from "electron";
import {
  appVersionFromCoreArguments,
  cloudUrlFromCoreArguments,
  localDataFolderFromCoreArguments,
  sentryEnvironmentFromCoreArguments,
} from "../shared/channel";
import { adoptStagedSnapshot } from "./backups/adopt-restored-snapshot";
import { createRestoreAttempts } from "./backups/restore-attempts";
import { createRestoreLaunch } from "./backups/restore-launch";
import { storingEnrollmentCredentials } from "./backups/restore-on-enrollment";
import { restorePendingIn } from "./backups/restore-pending";
import { syncUnlessRestorePending } from "./backups/restore-sync-hold";
import { requestFirstPinCode } from "./credentials/first-pin-code-request";
import { checkPinCodeRedemption, redeemPinCode } from "./credentials/pin-code-redemption";
import { pinPolicy } from "./credentials/pin-policy";
import { applyRedeemedPin } from "./credentials/redeemed-pin";
import { createClockGuardRequests } from "./fiscal/clock-guard-answers";
import { cryptoShortCodes } from "./fiscal/crypto-short-codes";
import { createFiscalModeWatch } from "./fiscal/fiscal-mode-watch";
import {
  cloudCreditNotes,
  createRealTimeAuthorization,
  settleInterruptedAuthorizations,
  startRegisterHealthChecks,
} from "./fiscal/real-time-authorization-wiring";
import { readFiscalEmissionModeIn } from "./fiscal/sqlite-fiscal-emission-mode";
import { readLatestPreEmissionGateOutcome } from "./fiscal/sqlite-pre-emission-gate";
import { readLatestClockOffsetMs } from "./fiscal/sqlite-register-health-checks";
import { createMessageGate, type RejectionRecorder, summarizeRejection } from "./message-gate";
import { createInterruptedChargesWiring } from "./payments/interrupted-charges-wiring";
import { createMercadoPagoCharging } from "./payments/mercado-pago-charge-wiring";
import { createPaidOrderDiscoveryWiring } from "./payments/paid-order-discovery-wiring";
import { paymentMethodAvailabilityFor } from "./payments/payment-method-availability-requests";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloud,
  postToCloudWithBearer,
} from "./platform/cloud-client";
import { initializeErrorReporting } from "./platform/error-reporting";
import { createHeldMessages } from "./platform/held-messages";
import { LOCAL_MIGRATIONS } from "./platform/local-migrations";
import { createMainRequests } from "./platform/main-requests";
import { refreshKeysWhenAnnounced } from "./register/announced-key-refresh";
import { createBatteryShutdown } from "./register/battery-shutdown";
import { createBatteryWatch } from "./register/battery-watch";
import {
  cashMovementKindsFor,
  currentCashMovements,
  recordCashMovementFor,
} from "./register/cash-movement-requests";
import {
  cashBalanceFor,
  cashCountPreviewFor,
  closeCashSessionFor,
  closeLockedCashSessionFor,
  currentCashSession,
  identifyLockedCloserFor,
  lockedClosersFor,
  openCashSessionFor,
  sessionOpenSaleFor,
} from "./register/cash-session-requests";
import { coreFailureReporters } from "./register/core-failure-reporters";
import { createDeviceTokenRotation } from "./register/device-token-rotation";
import { startDeviceTokenRotationSchedule } from "./register/device-token-rotation-schedule";
import {
  checkEnrollmentCode,
  enroll,
  generatePepper,
  installationReportFrom,
} from "./register/enrollment";
import {
  fileSnapshotCorruptionReports,
  SNAPSHOT_CORRUPTION_UNREPORTED_FILE,
} from "./register/file-snapshot-corruption-reports";
import { type StartedLocalDatabase, startLocalDatabase } from "./register/local-database-startup";
import { refuseNewerDatabase } from "./register/newer-database-refusal";
import { readReceiptPrinterFor, setReceiptPrinterFor } from "./register/receipt-printer-requests";
import { registerServiceOf } from "./register/register-service-of-database";
import { registerStatusFor } from "./register/register-status-requests";
import { createSerialDeviceWatch, pathOfMatchingDevice } from "./register/serial-device-watch";
import { serialDevicesReportOf } from "./register/serial-devices-report";
import { readSerialDevicesFor, registerSerialDevicesFor } from "./register/serial-devices-requests";
import { listSerialPorts, serialportEnumeration } from "./register/serialport-enumeration";
import { snapshotCorruptionReportSending } from "./register/snapshot-corruption-report-sending";
import type { SnapshotCycleSchedule } from "./register/snapshot-cycle-schedule";
import { startSnapshotCycle } from "./register/snapshot-cycle-wiring";
import { readOpenSession } from "./register/sqlite-cash-ledger";
import { localDatabaseDamageIn } from "./register/sqlite-local-database-health";
import { SqliteRestorationEvidence } from "./register/sqlite-restoration-evidence";
import { SqliteSerialDeviceRegistrations } from "./register/sqlite-serial-device-registrations";
import { startupPendingFor } from "./register/startup-pending-requests";
import { recoverAtStartup } from "./register/startup-recovery";
import { createStorageWatch } from "./register/storage-watch";
import { createUpdateHold, gateRendererRequest } from "./register/update-hold";
import { uuidV7Ids } from "./register/uuid-v7-ids";
import { windowsBatteryReader } from "./register/windows-battery-reader";
import { windowsCriticalBatteryActionReader } from "./register/windows-critical-battery-action-reader";
import { createRendererConnection } from "./renderer-connection";
import { type CoreToRendererMessage, rendererToCoreMessageSchema } from "./renderer-messages";
import { answerRendererRequest, type RendererRequestDeps } from "./renderer-requests";
import { createBarcodeReaderWiring } from "./sales/barcode-reader-wiring";
import { createReceiptPrinting } from "./sales/receipt-printing-wiring";
import {
  addSearchedProductFor,
  addWeighedProductFor,
  adjustSaleLineFor,
  applySaleDiscountFor,
  cancelLockedSaleFor,
  cancelPaidSaleFor,
  cancelSaleFor,
  cashChargeFor,
  changeLineQuantityFor,
  changeLineWeightFor,
  chargeSaleByTransferFor,
  chargeSaleInCashFor,
  chargeSaleOnStandaloneTerminalFor,
  currentSaleFor,
  previewSaleDiscountFor,
  previewSaleLineAdjustmentFor,
  removeSaleLineFor,
  scanProductFor,
  searchProductsFor,
  weighProductFor,
} from "./sales/sale-requests";
import { saleHistoryDetailFor, salesHistoryFor } from "./sales/sales-history-requests";
import { createSystelScale } from "./sales/scale/systel-scale";
import { openSerialLink } from "./sales/serial-link/open-serial-link";
import { anySaleIsOpen } from "./sales/sqlite-open-sale-presence";
import { voidSaleFor } from "./sales/void-sale-requests";
import { createActionGate } from "./sessions/action-gate";
import { authorizersOf } from "./sessions/authorizers";
import { hashPin } from "./sessions/pin-hash";
import { redeemedPerson } from "./sessions/redeemed-person";
import { firstSignIn, signIn } from "./sessions/sign-in";
import { lookUpSignIn } from "./sessions/sign-in-lookup";
import { createSignedInPerson } from "./sessions/signed-in-person";
import { SqliteSignInStore } from "./sessions/sqlite-sign-in-store";
import { createInitialCountRequests } from "./stock/initial-count-answers";
import {
  checkInstallation,
  installationCheckResultOf,
  installationCheckWarningOf,
} from "./sync/check-installation";
import {
  type CloudReachability,
  INITIAL_CLOUD_REACHABILITY,
  nextCloudReachability,
} from "./sync/cloud-reachability";
import { pruneLocalOutbox } from "./sync/prune-local-outbox";
import { pullFromCloud, pullResultOf, pullWarningOf } from "./sync/pull-from-cloud";
import { pushDamagedRegisterReport } from "./sync/push-damaged-register-report";
import { pushForRegisterService } from "./sync/push-for-register-service";
import { pushResultOf, pushToCloud, pushWarningOf } from "./sync/push-to-cloud";
import { damagedRegisterTelemetryReader, registerTelemetryReader } from "./sync/register-telemetry";
import { replenishBeforeSync } from "./sync/replenish-before-sync";
import {
  replenishmentReportOf,
  replenishRestoredRegisterStep,
} from "./sync/replenish-restored-register-step";
import { SqliteAcceptedPushLog } from "./sync/sqlite-accepted-push-log";
import { SqliteLocalInstallation, salesStopOf } from "./sync/sqlite-local-installation";
import { SqliteLocalOutbox } from "./sync/sqlite-local-outbox";
import { SqliteLocalReplica } from "./sync/sqlite-local-replica";
import {
  nodeStorageFileSystem,
  storageReadingReader,
  storageTelemetryReader,
} from "./sync/storage-telemetry";
import { runSyncCycle } from "./sync/sync-cycle";
import { createSyncSchedule } from "./sync/sync-schedule";

// No DSN here: @sentry/electron's utility SDK hands every envelope to main, which owns the
// destination and replaces the environment on events, but forwards logs untouched.
const sentryEnvironment = sentryEnvironmentFromCoreArguments(process.argv);
if (sentryEnvironment) {
  initializeErrorReporting(sentryEnvironment, Sentry);
}

// consoleLoggingIntegration also ships this console line as a Sentry log, so it must already
// carry the same redacted summary as the reported event.
const recorder: RejectionRecorder = {
  recordRejection(rejection) {
    const summary = summarizeRejection(rejection);
    console.error("core: rejected message", summary);
    Sentry.captureMessage("core: rejected message", { level: "warning", extra: { ...summary } });
  },
};

const gateFromMain = createMessageGate(mainToCoreMessageSchema, recorder);
const messagesFromMain = createHeldMessages<Electron.MessageEvent>();
process.parentPort.on("message", messagesFromMain.receive);
const gateFromRenderer = createMessageGate(rendererToCoreMessageSchema, recorder);

const mainRequests = createMainRequests({
  post: (message) => process.parentPort.postMessage(message),
  newRequestId: randomUUID,
});

const cloudUrl = cloudUrlFromCoreArguments(process.argv);
if (cloudUrl === undefined) {
  console.error("core: no cloud configured for this channel, so it can't enroll");
}
const cloudClient: CloudClientDeps | undefined =
  cloudUrl === undefined
    ? undefined
    : { cloudUrl, fetch: (input, init) => net.fetch(input, init), sleep };

const now = () => new Date();
const LOCAL_DATABASE_FILE = "register.sqlite";
const SNAPSHOTS_FOLDER = "snapshots";
const SYNC_INTERVAL_MS = 30_000;
const SYNC_FAILURE_BACKOFF = { baseMs: 2000, maxMs: 60_000 };
const PULLED_NOTICE: CoreToRendererMessage = { type: "pulled" };
const SERIAL_DEVICES_CHANGED_NOTICE: CoreToRendererMessage = { type: "serial-devices-changed" };
const STORAGE_STANDING_CHANGED_NOTICE: CoreToRendererMessage = {
  type: "storage-standing-changed",
};
const BATTERY_STANDING_CHANGED_NOTICE: CoreToRendererMessage = {
  type: "battery-standing-changed",
};
const FISCAL_MODE_CHANGED_NOTICE: CoreToRendererMessage = { type: "fiscal-mode-changed" };
const QUIT_REGISTER_MESSAGE: QuitRegisterMessage = { type: "quit-register" };
const SERIAL_DEVICE_CHECK_INTERVAL_MS = 3_000;
const BARCODE_READER_RETRY_MS = 3_000;

const localDataFolder = localDataFolderFromCoreArguments(process.argv);
const localDatabasePath =
  localDataFolder === undefined ? undefined : join(localDataFolder, LOCAL_DATABASE_FILE);
const localDatabaseDamaged = localDatabaseDamageIn(localDataFolder);
const restorePending = restorePendingIn(localDataFolder);
const restoreAttempts = createRestoreAttempts({
  pending: restorePending,
  launch: createRestoreLaunch({
    pending: restorePending,
    readCredentials: () => mainRequests.readCredentials(),
    cloudUrl,
    dataFolder: localDataFolder,
    postToMain: (message) => process.parentPort.postMessage(message),
  }),
  restartCore: () => process.exit(0),
  resumeSync: () => syncSchedule.syncNow(),
  reportNoUsableGeneration: () => {
    console.error("core: no snapshot generation could be restored, so the restore stays pending");
    Sentry.captureMessage("core: no snapshot generation could be restored", "error");
  },
});

async function startLocalDatabaseFile(): Promise<StartedLocalDatabase | undefined> {
  if (localDatabasePath === undefined) {
    console.error("core: no local data folder was handed over, so it can't pull or sign anyone in");
    return undefined;
  }
  try {
    const started = await startLocalDatabase({
      path: localDatabasePath,
      migrations: LOCAL_MIGRATIONS,
      now,
    });
    console.info(
      {
        ready: "core: the local database is ready",
        out_of_service: "core: the local database is damaged, so the register is out of service",
        newer_than_version:
          "core: the local database was migrated by a newer version, so it is left untouched",
      }[started.kind],
    );
    return started;
  } catch (error) {
    console.error(
      "core: the local database could not be opened, so it can't pull or sign anyone in",
      error,
    );
    Sentry.captureException(error);
    return undefined;
  }
}

if (localDataFolder !== undefined) {
  await adoptStagedSnapshot({
    folder: localDataFolder,
    pending: restorePending,
    migrations: LOCAL_MIGRATIONS,
    now,
  }).catch((error: unknown) => {
    console.error("core: the restored snapshot could not be adopted", error);
    Sentry.captureException(error);
  });
}

const startedLocalDatabase = await startLocalDatabaseFile();
if (
  refuseNewerDatabase(startedLocalDatabase, {
    post: (message) => process.parentPort.postMessage(message),
    log: (line) => console.error(line),
  })
) {
  await new Promise<never>(() => {});
}

const register = registerServiceOf(startedLocalDatabase, () => process.exit(1));
const localDatabase = register.database;
const replica = localDatabase === undefined ? undefined : new SqliteLocalReplica(localDatabase);
const localOutbox =
  localDatabase === undefined ? undefined : new SqliteLocalOutbox(localDatabase, now);
const restorationOf = (database: NonNullable<typeof localDatabase>) =>
  new SqliteRestorationEvidence(database, restorePending);
const localInstallation =
  localDatabase === undefined ? undefined : new SqliteLocalInstallation(localDatabase, now);
let cloudReachability: CloudReachability = INITIAL_CLOUD_REACHABILITY;
const signInStore = localDatabase === undefined ? undefined : new SqliteSignInStore(localDatabase);
const signedInPerson = createSignedInPerson();
const readPepper = async () => (await mainRequests.readCredentials())?.pepper;
const actionGate =
  signInStore === undefined
    ? undefined
    : createActionGate({
        store: signInStore,
        signedInPerson,
        readPepper,
        hashPin,
        now,
      });

const { reportFailure, reportSyncFailure, reportRedeemedPinFailure } = coreFailureReporters({
  log: console.error,
  capture: Sentry.captureException,
  watchFailure: register.watchFailure,
  noteStorageFailure: (error) => storageWatch?.noteFailure(error),
});

const serialDeviceEnumeration = serialportEnumeration({
  list: listSerialPorts,
  onListed: () => console.info("core: serial devices listed"),
});
const serialDeviceWatch =
  localDatabase === undefined
    ? undefined
    : createSerialDeviceWatch({
        registrations: new SqliteSerialDeviceRegistrations(localDatabase),
        enumeration: serialDeviceEnumeration,
        intervalMs: SERIAL_DEVICE_CHECK_INTERVAL_MS,
        scheduleNext: (run, delayMs) => {
          const timer = setTimeout(run, delayMs);
          return () => clearTimeout(timer);
        },
        onChange: () => {
          rendererConnection.tell(SERIAL_DEVICES_CHANGED_NOTICE);
          void barcodeReaderWiring.onDevicesChanged();
        },
        onFailure: (error) => reportFailure("watching the serial devices", error),
      });

const batteryWatch = createBatteryWatch({
  reader: windowsBatteryReader({ run: promisify(execFile), platform: process.platform }),
  intervalMs: BATTERY_READ_INTERVAL_MS,
  scheduleNext: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
  clock: { now },
  onChange: () => {
    rendererConnection.tell(BATTERY_STANDING_CHANGED_NOTICE);
    batteryShutdown.evaluate();
  },
  onFailure: (error) => reportFailure("reading the battery", error),
});

let criticalBatteryAction: CriticalBatteryAction = { kind: "unreadable" };

const storageWatch =
  localDatabase === undefined
    ? undefined
    : createStorageWatch({
        read: storageReadingReader(localDatabase.name, nodeStorageFileSystem),
        intervalMs: STORAGE_READ_INTERVAL_MS,
        scheduleNext: (run, delayMs) => {
          const timer = setTimeout(run, delayMs);
          return () => clearTimeout(timer);
        },
        onChange: () => rendererConnection.tell(STORAGE_STANDING_CHANGED_NOTICE),
        onFailure: (error) => reportFailure("watching the storage", error),
        onStartupFailure: (error) =>
          reportFailure("checking the free disk space at startup", error),
      });
await storageWatch?.checkAtStartup();

const systelScale = createSystelScale({
  path: () => serialDeviceWatch && pathOfMatchingDevice(serialDeviceWatch.reading(), "scale"),
  openLink: openSerialLink,
});

const barcodeReaderWiring = createBarcodeReaderWiring({
  watch: serialDeviceWatch,
  openLink: openSerialLink,
  tell: (message) => rendererConnection.tell(message),
  reportFailure,
  retryMs: BARCODE_READER_RETRY_MS,
});

const snapshotCorruptionReports =
  localDataFolder === undefined
    ? undefined
    : fileSnapshotCorruptionReports(join(localDataFolder, SNAPSHOT_CORRUPTION_UNREPORTED_FILE));

const sendSnapshotCorruptionReport = snapshotCorruptionReportSending({
  reports: snapshotCorruptionReports,
  cloudClient,
  readDeviceToken: async () => (await mainRequests.readCredentials())?.device_token,
  reportFailure: (error) => reportFailure("reporting the snapshot corruption to the cloud", error),
});

async function pushOutboxToCloud() {
  const post =
    cloudClient === undefined
      ? undefined
      : (path: string, bearerToken: string, body: unknown) =>
          postToCloudWithBearer(cloudClient, path, bearerToken, body);
  const attempt = await pushForRegisterService({
    service: register.service,
    reportDamagedDatabase:
      localDatabasePath === undefined
        ? undefined
        : () =>
            pushDamagedRegisterReport({
              readCredentials: () => mainRequests.readCredentials(),
              post,
              appVersion: appVersionFromCoreArguments(process.argv),
              readTelemetry: damagedRegisterTelemetryReader(
                storageTelemetryReader(localDatabasePath, nodeStorageFileSystem),
                () => batteryWatch.report(),
              ),
            }),
    sendSnapshotCorruptionReport,
    pushOutbox: () =>
      pushToCloud({
        readCredentials: () => mainRequests.readCredentials(),
        outbox: localOutbox,
        installation: localInstallation,
        adoptDevice: (device) => replica?.adoptDevice(device),
        post,
        appVersion: appVersionFromCoreArguments(process.argv),
        readTelemetry:
          localDatabase === undefined ||
          serialDeviceWatch === undefined ||
          storageWatch === undefined
            ? undefined
            : registerTelemetryReader(
                storageTelemetryReader(localDatabase.name, nodeStorageFileSystem),
                () => salesStopOf(localDatabase),
                () => serialDevicesReportOf(serialDeviceWatch.reading()),
                () => readLatestPreEmissionGateOutcome(localDatabase),
                () => batteryWatch.report(),
                storageWatch.stop,
                localDatabaseDamaged,
                batteryShutdown.newSalesStoppedByBattery,
                () => readLatestClockOffsetMs(localDatabase),
              ),
        acceptedPush:
          localDatabase === undefined
            ? undefined
            : { log: new SqliteAcceptedPushLog(localDatabase), clock: { now } },
      }),
  });
  cloudReachability = nextCloudReachability(cloudReachability, attempt);
  const warning = pushWarningOf(attempt);
  if (warning !== undefined) {
    console.warn(warning, attempt);
  }
  return pushResultOf(attempt);
}

const anySaleOpen = () => localDatabase !== undefined && anySaleIsOpen(localDatabase);

const batteryShutdown = createBatteryShutdown({
  report: () => batteryWatch.report(),
  hasOpenSale: anySaleOpen,
  push: pushOutboxToCloud,
  schedule: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
  quit: () => process.parentPort.postMessage(QUIT_REGISTER_MESSAGE),
  pushLimitMs: CRITICAL_BATTERY_PUSH_LIMIT_MS,
  saleRecheckMs: CRITICAL_BATTERY_SALE_RECHECK_MS,
  onFailure: (error) => reportFailure("the push before closing for a critical battery", error),
});

// An unreachable cloud is how a register without internet looks, so only an unexpected stop is
// reported; the next cycle resumes from the cursor and the outbox already saved either way.
const syncSchedule = createSyncSchedule({
  syncOnce: syncUnlessRestorePending(
    restorePending.isPending,
    () => void restoreAttempts.attempt(),
    replenishBeforeSync({
      replenish: () =>
        replenishRestoredRegisterStep({
          database: localDatabase,
          readCredentials: () => mainRequests.readCredentials(),
          post:
            cloudClient === undefined
              ? undefined
              : (path, bearerToken, body) =>
                  postToCloudWithBearer(cloudClient, path, bearerToken, body),
          ids: uuidV7Ids,
        }),
      report: (attempt) => {
        const report = replenishmentReportOf(attempt);
        if (report === undefined) {
          return;
        }
        if (report.level === "error") {
          console.error(report.message, attempt);
          Sentry.captureMessage(report.message, "error");
        } else {
          console.warn(report.message, attempt);
        }
      },
      onFailure: (error) => reportFailure("the replenishment of the restored register", error),
      syncOnce: () =>
        runSyncCycle({
          checkInstallation: async () => {
            const attempt = await checkInstallation({
              readCredentials: () => mainRequests.readCredentials(),
              installation: localInstallation,
              adoptDevice: (device) => replica?.adoptDevice(device),
              getFromCloud:
                cloudClient === undefined
                  ? undefined
                  : (path, headers) => getFromCloud(cloudClient, path, headers),
            });
            const warning = installationCheckWarningOf(attempt);
            if (warning !== undefined) {
              console.warn(warning, attempt);
            }
            return installationCheckResultOf(attempt);
          },
          push: pushOutboxToCloud,
          prune: async () => {
            await pruneLocalOutbox({ outbox: localOutbox, now });
          },
          pull: async () => {
            const attempt = await pullFromCloud({
              readCredentials: () => mainRequests.readCredentials(),
              replica,
              getFromCloud:
                cloudClient === undefined
                  ? undefined
                  : (path, headers) => getFromCloud(cloudClient, path, headers),
            });
            const warning = pullWarningOf(attempt);
            if (warning !== undefined) {
              console.warn(warning, attempt);
            }
            return pullResultOf(attempt);
          },
          onCheckFailure: (error) => reportFailure("the installation check", error),
          onPushFailure: (error) => reportFailure("the push", error),
          onPruneFailure: (error) => reportFailure("the outbox pruning", error),
        }),
    }),
  ),
  intervalMs: SYNC_INTERVAL_MS,
  failureBackoff: SYNC_FAILURE_BACKOFF,
  random: Math.random,
  scheduleNext: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
  onFailure: reportSyncFailure,
  afterEachSync: () => {
    rendererConnection.tell(PULLED_NOTICE);
    interruptedCharges.afterEachSync();
    paidOrderDiscovery.afterEachSync();
  },
});

const readDeviceToken = async () => (await mainRequests.readCredentials())?.device_token;
const realTimeAuthorization = createRealTimeAuthorization({
  database: localDatabase,
  cloudClient,
  readDeviceToken,
  now,
  reportFailure: (error) => reportFailure("the real-time authorization", error),
  ids: uuidV7Ids,
  shortCodes: cryptoShortCodes,
});
const fiscalModeWatch =
  localDatabase === undefined
    ? undefined
    : createFiscalModeWatch({
        read: () => readFiscalEmissionModeIn(localDatabase, now()).kind,
        onChanged: () => rendererConnection.tell(FISCAL_MODE_CHANGED_NOTICE),
      });
const mercadoPagoCharging = createMercadoPagoCharging({
  database: localDatabase,
  gate: actionGate,
  cloudClient,
  readDeviceToken,
  readOutboxChainKey: async () => (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
  now,
  ids: uuidV7Ids,
  restoration: localDatabase === undefined ? undefined : restorationOf(localDatabase),
});

const receiptPrinting = createReceiptPrinting({
  database: localDatabase,
  gate: actionGate,
  now,
  ids: uuidV7Ids,
  readOutboxChainKey: async () => (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
  signedInUserId: () => signedInPerson.userId(),
  beforePrinting: async (saleId) => {
    await realTimeAuthorization.authorizeSale(saleId);
    fiscalModeWatch?.check();
  },
  reportFailure,
  syncNow: () => syncSchedule.syncNow(),
});

const interruptedCharges = createInterruptedChargesWiring({
  charging: mercadoPagoCharging,
  printing: receiptPrinting,
  reportFailure,
});

const paidOrderDiscovery = createPaidOrderDiscoveryWiring({
  database: localDatabase,
  gate: actionGate,
  printing: receiptPrinting,
  cloudClient,
  readDeviceToken,
  readOutboxChainKey: async () => (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
  now,
  ids: uuidV7Ids,
  reportFailure,
});

const startupRecovery = recoverAtStartup({
  settleInterruptedAuthorizations: () =>
    settleInterruptedAuthorizations({
      database: localDatabase,
      now,
      reportFailure: (error) =>
        reportFailure("settling the interrupted real-time authorizations", error),
      ids: uuidV7Ids,
      shortCodes: cryptoShortCodes,
    }),
  followInterruptedCharges: interruptedCharges.followAtStartup,
  discoverPaidOrders: paidOrderDiscovery.discoverAtStartup,
  startSync: () => syncSchedule.start(),
  reportFailure,
});
await startupRecovery.authorizationsSettled;

const rendererRequestDeps: RendererRequestDeps = {
  credentialsPresent: () => mainRequests.credentialsPresent(),
  registerStatus:
    localDatabase === undefined || serialDeviceWatch === undefined || storageWatch === undefined
      ? undefined
      : () =>
          registerStatusFor({
            database: localDatabase,
            cloud: () => cloudReachability,
            now,
            signedInPerson,
            serialDevices: serialDeviceWatch.reading,
            storage: storageWatch.standing,
            localDatabaseDamaged,
            battery: () => batteryWatch.report(),
            newSalesStoppedByBattery: batteryShutdown.newSalesStoppedByBattery,
            criticalBatteryAction: () => criticalBatteryAction,
          }),
  registerService: register.service,
  registerName: () => replica?.registerName(),
  enroll: async (typedCode: string) => {
    const outcome = await enroll(
      {
        postToCloud:
          cloudClient === undefined
            ? undefined
            : (path, body) => postToCloud(cloudClient, path, body),
        installationReport: () => installationReportFrom({ hostname, version, release }),
        canStoreCredentials: () => mainRequests.canStoreCredentials(),
        generatePepper,
        storeCredentials: storingEnrollmentCredentials({
          store: (credentials) => mainRequests.storeCredentials(credentials),
          pending: restorePending,
          database: localDatabase,
        }),
        now,
      },
      typedCode,
    );
    if (outcome.kind === "enrolled") {
      void restoreAttempts.attempt();
      syncSchedule.syncNow();
    }
    return outcome;
  },
  pinPolicy,
  checkEnrollmentCode,
  checkPinCodeRedemption,
  redeemPinCode: (typedCode: string, newPin: string) =>
    redeemPinCode(
      {
        readCredentials: () => mainRequests.readCredentials(),
        postToCloud:
          cloudClient === undefined
            ? undefined
            : (path, bearerToken, body) =>
                postToCloudWithBearer(cloudClient, path, bearerToken, body),
        applyRedeemedPin:
          localDatabase === undefined
            ? undefined
            : (pepper, redemption) =>
                applyRedeemedPin(localDatabase, pepper, redemption, (userId) =>
                  new SqliteSignInStore(localDatabase).remember(userId),
                ),
        reportLocalFailure: reportRedeemedPinFailure,
        openCashSession: () =>
          localDatabase === undefined ? undefined : readOpenSession(localDatabase),
        redeemedPerson: (userId) =>
          signInStore === undefined ? undefined : redeemedPerson(signInStore, userId),
        signedInPerson,
        cashSession: (signedInPersonId) =>
          localDatabase === undefined ? null : currentCashSession(localDatabase, signedInPersonId),
      },
      typedCode,
      newPin,
    ),
  signInUsers: signInStore === undefined ? undefined : () => signInStore.signableUsers(),
  authorizers:
    signInStore === undefined
      ? undefined
      : (permission) => authorizersOf(signInStore, { kind: "permission", permission }),
  lockedClosers: localDatabase === undefined ? undefined : () => lockedClosersFor(localDatabase),
  signIn:
    localDatabase === undefined || signInStore === undefined
      ? undefined
      : (userId, pin) =>
          signIn(
            {
              store: signInStore,
              signedInPerson,
              openCashSession: () => readOpenSession(localDatabase),
              cashSession: (signedInPersonId) =>
                currentCashSession(localDatabase, signedInPersonId),
              readPepper,
              hashPin,
              now,
            },
            userId,
            pin,
          ),
  firstSignIn:
    localDatabase === undefined || signInStore === undefined
      ? undefined
      : (userId, pin) =>
          firstSignIn(
            {
              store: signInStore,
              signedInPerson,
              openCashSession: () => readOpenSession(localDatabase),
              cashSession: (signedInPersonId) =>
                currentCashSession(localDatabase, signedInPersonId),
              readPepper,
              hashPin,
              now,
            },
            userId,
            pin,
          ),
  signInLookup:
    signInStore === undefined
      ? undefined
      : (email) =>
          lookUpSignIn(
            {
              readCredentials: () => mainRequests.readCredentials(),
              postToCloud:
                cloudClient === undefined
                  ? undefined
                  : (path, bearerToken, body) =>
                      postToCloudWithBearer(cloudClient, path, bearerToken, body),
              store: signInStore,
            },
            email,
          ),
  requestFirstPinCode: (userId) =>
    requestFirstPinCode(
      {
        readCredentials: () => mainRequests.readCredentials(),
        postToCloud:
          cloudClient === undefined
            ? undefined
            : (path, bearerToken, body) =>
                postToCloudWithBearer(cloudClient, path, bearerToken, body),
      },
      userId,
    ),
  signOut: () => signedInPerson.clear(),
  openCashSession:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (openingFloat) =>
          openCashSessionFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
            },
            openingFloat,
          ),
  closeCashSession:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (sessionId, countedCash) =>
          closeCashSessionFor(
            {
              database: localDatabase,
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
            },
            { sessionId, countedCash },
          ),
  closeLockedCashSession:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (sessionId, countedCash, closer) =>
          closeLockedCashSessionFor(
            {
              database: localDatabase,
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
            },
            { sessionId, countedCash, closer },
          ),
  cancelLockedSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : async (request) =>
          cancelLockedSaleFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
            },
            request,
          ),
  identifyLockedCloser:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (closer) => identifyLockedCloserFor({ database: localDatabase, gate: actionGate }, closer),
  cashBalance: localDatabase === undefined ? undefined : () => cashBalanceFor(localDatabase),
  cashCountPreview:
    localDatabase === undefined
      ? undefined
      : (countedCash) => cashCountPreviewFor(localDatabase, countedCash),
  sessionOpenSale:
    localDatabase === undefined ? undefined : () => sessionOpenSaleFor(localDatabase, now()),
  startupPending:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () =>
          startupPendingFor({
            database: localDatabase,
            gate: actionGate,
            paidOrderDiscovery: paidOrderDiscovery.state,
          }),
  cashSession:
    localDatabase === undefined
      ? undefined
      : () => currentCashSession(localDatabase, signedInPerson.userId()),
  recordCashMovement:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          recordCashMovementFor(
            {
              database: localDatabase,
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
            },
            request,
          ),
  cashMovements:
    localDatabase === undefined ? undefined : () => currentCashMovements(localDatabase),
  cashMovementKinds:
    localDatabase === undefined
      ? undefined
      : () => cashMovementKindsFor({ database: localDatabase, signedInPerson }),
  scanProduct:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (code) =>
          scanProductFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
              ids: uuidV7Ids,
              paidOrderDiscovery: paidOrderDiscovery.state,
              newSalesStoppedByDisk: () => storageWatch?.stop() !== undefined,
              localDatabaseDamaged,
              newSalesStoppedByBattery: batteryShutdown.newSalesStoppedByBattery,
            },
            code,
          ),
  changeLineQuantity:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (lineId, quantity, expectedQuantity) =>
          changeLineQuantityFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
            },
            lineId,
            quantity,
            expectedQuantity,
          ),
  changeLineWeight:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (lineId, weightThousandths, expectedWeightThousandths) =>
          changeLineWeightFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
            },
            lineId,
            weightThousandths,
            expectedWeightThousandths,
          ),
  adjustSaleLine:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          adjustSaleLineFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
            },
            request,
          ),
  previewSaleLineAdjustment:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          previewSaleLineAdjustmentFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
            },
            request,
          ),
  applySaleDiscount:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          applySaleDiscountFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
            },
            request,
          ),
  previewSaleDiscount:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          previewSaleDiscountFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
            },
            request,
          ),
  removeSaleLine:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (lineId) =>
          removeSaleLineFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
            },
            lineId,
          ),
  cancelSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () =>
          cancelSaleFor({
            database: localDatabase,
            restoration: restorationOf(localDatabase),
            gate: actionGate,
            now,
          }),
  cancelPaidSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : async (request) =>
          cancelPaidSaleFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
            },
            request,
          ),
  voidSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : async (request) =>
          voidSaleFor(
            {
              database: localDatabase,
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
              creditNotes: cloudCreditNotes({ cloudClient, readDeviceToken }),
              printCreditNote: receiptPrinting.printVoidedSaleCreditNote,
              reportFailure: (error) => reportFailure("printing a credit note", error),
            },
            request,
          ),
  chargeSaleInCash:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          chargeSaleInCashFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
            },
            request,
          ),
  chargeSaleByTransfer:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          chargeSaleByTransferFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
            },
            request,
          ),
  chargeSaleOnStandaloneTerminal:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          chargeSaleOnStandaloneTerminalFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now,
              ids: uuidV7Ids,
            },
            request,
          ),
  startMercadoPagoCharge: mercadoPagoCharging.start,
  followMercadoPagoCharge: mercadoPagoCharging.follow,
  paymentMethodAvailability:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () =>
          paymentMethodAvailabilityFor({
            database: localDatabase,
            restoration: restorationOf(localDatabase),
            gate: actionGate,
            now,
            cloud: () => cloudReachability,
          }),
  abandonMercadoPagoCharge: mercadoPagoCharging.abandon,
  convertPaidOrderIntoRefund: paidOrderDiscovery.convertIntoRefund,
  searchProducts:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (query) =>
          searchProductsFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
            },
            query,
          ),
  addProduct:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (productId) =>
          addSearchedProductFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
              ids: uuidV7Ids,
              paidOrderDiscovery: paidOrderDiscovery.state,
              newSalesStoppedByDisk: () => storageWatch?.stop() !== undefined,
              localDatabaseDamaged,
              newSalesStoppedByBattery: batteryShutdown.newSalesStoppedByBattery,
            },
            productId,
          ),
  addWeighedProduct:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (productId, weightThousandths) =>
          addWeighedProductFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
              ids: uuidV7Ids,
              paidOrderDiscovery: paidOrderDiscovery.state,
              newSalesStoppedByDisk: () => storageWatch?.stop() !== undefined,
              localDatabaseDamaged,
              newSalesStoppedByBattery: batteryShutdown.newSalesStoppedByBattery,
            },
            productId,
            weightThousandths,
          ),
  weighProduct:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (productId) =>
          weighProductFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
              ids: uuidV7Ids,
              paidOrderDiscovery: paidOrderDiscovery.state,
              newSalesStoppedByDisk: () => storageWatch?.stop() !== undefined,
              localDatabaseDamaged,
              newSalesStoppedByBattery: batteryShutdown.newSalesStoppedByBattery,
              scale: systelScale,
            },
            productId,
          ),
  initialCount:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : createInitialCountRequests({
          database: localDatabase,
          gate: actionGate,
          readOutboxChainKey: async () =>
            (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
          now,
          ids: uuidV7Ids,
          scale: systelScale,
        }),
  clockGuard:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : createClockGuardRequests({
          database: localDatabase,
          gate: actionGate,
          signedInPerson,
          readOutboxChainKey: async () =>
            (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
          now,
          ids: uuidV7Ids,
        }),
  currentSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () =>
          currentSaleFor({
            database: localDatabase,
            restoration: restorationOf(localDatabase),
            gate: actionGate,
            now,
          }),
  cashCharge:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          cashChargeFor(
            {
              database: localDatabase,
              restoration: restorationOf(localDatabase),
              gate: actionGate,
              now,
            },
            request,
          ),
  salesHistory:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) => salesHistoryFor({ database: localDatabase, gate: actionGate, now }, request),
  saleHistoryDetail:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (saleId) =>
          saleHistoryDetailFor({ database: localDatabase, gate: actionGate, now }, saleId),
  readReceiptPrinter:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () => readReceiptPrinterFor({ database: localDatabase, gate: actionGate }),
  setReceiptPrinter:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (address) => setReceiptPrinterFor({ database: localDatabase, gate: actionGate }, address),
  readSerialDevices:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () =>
          readSerialDevicesFor({
            database: localDatabase,
            gate: actionGate,
            enumeration: serialDeviceEnumeration,
          }),
  registerSerialDevices:
    localDatabase === undefined || actionGate === undefined || serialDeviceWatch === undefined
      ? undefined
      : (devices) =>
          registerSerialDevicesFor(
            {
              database: localDatabase,
              gate: actionGate,
              recheck: () => serialDeviceWatch.checkNow(),
            },
            devices,
          ),
  receiptPrintStatus: receiptPrinting.receiptPrintStatus,
  printOriginalReceipt: receiptPrinting.printOriginalReceipt,
  reprintSaleReceipt: receiptPrinting.reprintSaleReceipt,
  printCreditNote: receiptPrinting.printCreditNote,
  reportFailure,
};

const answeredRendererRequestDeps: RendererRequestDeps = {
  ...rendererRequestDeps,
  chargeSaleInCash: receiptPrinting.afterCompletedSale(rendererRequestDeps.chargeSaleInCash),
  chargeSaleByTransfer: receiptPrinting.afterCompletedSale(
    rendererRequestDeps.chargeSaleByTransfer,
  ),
  chargeSaleOnStandaloneTerminal: receiptPrinting.afterCompletedSale(
    rendererRequestDeps.chargeSaleOnStandaloneTerminal,
  ),
  followMercadoPagoCharge: receiptPrinting.afterCompletedSale(
    rendererRequestDeps.followMercadoPagoCharge,
  ),
  abandonMercadoPagoCharge: receiptPrinting.afterCompletedSale(
    rendererRequestDeps.abandonMercadoPagoCharge,
  ),
};

startRegisterHealthChecks({
  database: localDatabase,
  cloudClient,
  readDeviceToken,
  now,
  scheduleNext: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
  reportFailure: (error) => reportFailure("the register health check", error),
  afterCheck: () => fiscalModeWatch?.check(),
});

const deviceTokenRotation =
  cloudClient === undefined
    ? undefined
    : createDeviceTokenRotation({
        readCredentials: () => mainRequests.readCredentials(),
        postToCloud: (path, bearerToken) => postToCloudWithBearer(cloudClient, path, bearerToken),
        replaceCredentials: (expectedDeviceToken, credentials) =>
          mainRequests.replaceCredentials(expectedDeviceToken, credentials),
        now,
      });

if (deviceTokenRotation !== undefined) {
  startDeviceTokenRotationSchedule({
    rotate: deviceTokenRotation.rotateWhenDue,
    schedule: (run, delayMs) => {
      const id = setTimeout(run, delayMs);
      return () => clearTimeout(id);
    },
  });
}

const updateHold = createUpdateHold({
  hasOpenSale: anySaleOpen,
  schedule: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
  limitMs: REGISTER_UPDATE_HOLD_LIMIT_MS,
});

const rendererConnection = createRendererConnection(
  (data, reply) => {
    gateFromRenderer(
      data,
      gateRendererRequest(
        updateHold,
        (message) =>
          answerRendererRequest(answeredRendererRequestDeps, message).then((answer) => {
            if (answer !== undefined) {
              reply(answer);
            }
          }),
        (requestId) => reply({ type: "refused-while-updating", request_id: requestId }),
      ),
    );
  },
  () => signedInPerson.clear(),
);

let snapshotCycle: SnapshotCycleSchedule | undefined;

messagesFromMain.deliverTo((event) => {
  const [rendererPort] = event.ports;
  if (rendererPort) {
    rendererConnection.adopt(rendererPort);
    return;
  }
  gateFromMain(event.data, (message) => {
    if (message.type === "update-safe-moment-request") {
      void updateHold
        .answerSafeMomentRequest(message.request_id)
        .then((answer) => process.parentPort.postMessage(answer));
    } else if (message.type === "update-hold-release") {
      updateHold.release();
    } else if (message.type === "snapshot-worker-exited") {
      void snapshotCycle?.workerExited(message.copy_failed_stage);
      restoreAttempts.workerExited(message.restore_outcome);
      if (deviceTokenRotation !== undefined) {
        refreshKeysWhenAnnounced(message.latest_announced_key_version, {
          readCredentials: () => mainRequests.readCredentials(),
          refreshInstallationKeysNow: deviceTokenRotation.refreshInstallationKeysNow,
        }).catch((error: unknown) => reportFailure("refreshing the installation keys", error));
      }
    } else {
      mainRequests.receive(message);
    }
  });
});

process.parentPort.postMessage({ type: "core-ready" } satisfies CoreReadyMessage);
void restoreAttempts.attempt();
void batteryWatch.start();
void windowsCriticalBatteryActionReader({
  run: promisify(execFile),
  platform: process.platform,
  onFailure: (error) => reportFailure("reading Windows' critical-battery action", error),
})
  .read()
  .then((action) => {
    criticalBatteryAction = action;
    rendererConnection.tell(BATTERY_STANDING_CHANGED_NOTICE);
  });
void storageWatch?.start();
if (
  localDatabase !== undefined &&
  localDatabasePath !== undefined &&
  snapshotCorruptionReports !== undefined &&
  startedLocalDatabase?.kind === "ready"
) {
  snapshotCycle = startSnapshotCycle({
    database: localDatabase,
    databasePath: localDatabasePath,
    snapshotsFolder: join(dirname(localDatabasePath), SNAPSHOTS_FOLDER),
    cloudUrl,
    cloud: cloudClient,
    readCredentials: () => mainRequests.readCredentials(),
    batteryReport: () => batteryWatch.report(),
    cloudReachability: () => cloudReachability,
    readStorage: storageReadingReader(localDatabasePath, nodeStorageFileSystem),
    newGenerationId: () => uuidV7Ids.next(),
    postToMain: (message) => process.parentPort.postMessage(message),
    scheduleNext: (run, delayMs) => {
      setTimeout(run, delayMs);
    },
    localDatabaseDamaged,
    restorePending: restorePending.isPending,
    health: startedLocalDatabase.health,
    reports: snapshotCorruptionReports,
    onCopyFailureRecorded: () => rendererConnection.tell(STORAGE_STANDING_CHANGED_NOTICE),
    onFailure: (error) => reportFailure("running the snapshot cycle", error),
  });
}
void barcodeReaderWiring.startWatch();
