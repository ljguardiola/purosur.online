import { randomUUID } from "node:crypto";
import { hostname, release, version } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type CoreReadyMessage, mainToCoreMessageSchema } from "@purosur/contracts";
import * as Sentry from "@sentry/electron/utility";
import { net } from "electron";
import {
  appVersionFromCoreArguments,
  cloudUrlFromCoreArguments,
  localDataFolderFromCoreArguments,
  sentryEnvironmentFromCoreArguments,
} from "../shared/channel";
import { requestFirstPinCode } from "./credentials/first-pin-code-request";
import { checkPinCodeRedemption, redeemPinCode } from "./credentials/pin-code-redemption";
import { pinPolicy } from "./credentials/pin-policy";
import { applyRedeemedPin } from "./credentials/redeemed-pin";
import {
  createRealTimeAuthorization,
  startRegisterHealthChecks,
} from "./fiscal/real-time-authorization-wiring";
import { createMessageGate, type RejectionRecorder, summarizeRejection } from "./message-gate";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloud,
  postToCloudWithBearer,
} from "./platform/cloud-client";
import { initializeErrorReporting } from "./platform/error-reporting";
import { LOCAL_MIGRATIONS } from "./platform/local-migrations";
import { createMainRequests } from "./platform/main-requests";
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
import { rotateDeviceToken } from "./register/device-token-rotation";
import { startDeviceTokenRotationSchedule } from "./register/device-token-rotation-schedule";
import {
  checkEnrollmentCode,
  enroll,
  generatePepper,
  installationReportFrom,
} from "./register/enrollment";
import { type StartedLocalDatabase, startLocalDatabase } from "./register/local-database-startup";
import { registerServiceOf } from "./register/register-service-of-database";
import { registerStatusFor } from "./register/register-status-requests";
import { readOpenSession } from "./register/sqlite-cash-ledger";
import { uuidV7Ids } from "./register/uuid-v7-ids";
import { createRendererConnection } from "./renderer-connection";
import { type CoreToRendererMessage, rendererToCoreMessageSchema } from "./renderer-messages";
import { answerRendererRequest, type RendererRequestDeps } from "./renderer-requests";
import {
  addSearchedProductFor,
  cancelLockedSaleFor,
  cancelPaidSaleFor,
  cancelSaleFor,
  cashChargeFor,
  changeLineQuantityFor,
  chargeSaleByTransferFor,
  chargeSaleInCashFor,
  currentSaleFor,
  removeSaleLineFor,
  scanProductFor,
  searchProductsFor,
} from "./sales/sale-requests";
import { createActionGate } from "./sessions/action-gate";
import { authorizersOf } from "./sessions/authorizers";
import { hashPin } from "./sessions/pin-hash";
import { redeemedPerson } from "./sessions/redeemed-person";
import { firstSignIn, signIn } from "./sessions/sign-in";
import { lookUpSignIn } from "./sessions/sign-in-lookup";
import { createSignedInPerson } from "./sessions/signed-in-person";
import { SqliteSignInStore } from "./sessions/sqlite-sign-in-store";
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
import { pullFromCloud, pullResultOf } from "./sync/pull-from-cloud";
import { pushResultOf, pushToCloud, pushWarningOf } from "./sync/push-to-cloud";
import { registerTelemetryReader } from "./sync/register-telemetry";
import { SqliteAcceptedPushLog } from "./sync/sqlite-accepted-push-log";
import { SqliteLocalInstallation, salesStopOf } from "./sync/sqlite-local-installation";
import { SqliteLocalOutbox } from "./sync/sqlite-local-outbox";
import { SqliteLocalReplica } from "./sync/sqlite-local-replica";
import { nodeStorageFileSystem, storageTelemetryReader } from "./sync/storage-telemetry";
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
const SYNC_INTERVAL_MS = 30_000;
const SYNC_FAILURE_BACKOFF = { baseMs: 2000, maxMs: 60_000 };
const PULLED_NOTICE: CoreToRendererMessage = { type: "pulled" };

async function startLocalDatabaseFile(): Promise<StartedLocalDatabase | undefined> {
  const localDataFolder = localDataFolderFromCoreArguments(process.argv);
  if (localDataFolder === undefined) {
    console.error("core: no local data folder was handed over, so it can't pull or sign anyone in");
    return undefined;
  }
  try {
    const started = await startLocalDatabase({
      path: join(localDataFolder, LOCAL_DATABASE_FILE),
      migrations: LOCAL_MIGRATIONS,
      now,
    });
    console.info(
      started.kind === "ready"
        ? "core: the local database is ready"
        : "core: the local database is damaged, so the register is out of service",
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

const register = registerServiceOf(await startLocalDatabaseFile(), () => process.exit(1));
const localDatabase = register.database;
const replica = localDatabase === undefined ? undefined : new SqliteLocalReplica(localDatabase);
const localOutbox =
  localDatabase === undefined ? undefined : new SqliteLocalOutbox(localDatabase, now);
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
});

// An unreachable cloud is how a register without internet looks, so only an unexpected stop is
// reported; the next cycle resumes from the cursor and the outbox already saved either way.
const syncSchedule = createSyncSchedule({
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
      push: async () => {
        const attempt = await pushToCloud({
          readCredentials: () => mainRequests.readCredentials(),
          outbox: localOutbox,
          installation: localInstallation,
          adoptDevice: (device) => replica?.adoptDevice(device),
          post:
            cloudClient === undefined
              ? undefined
              : (path, bearerToken, body) =>
                  postToCloudWithBearer(cloudClient, path, bearerToken, body),
          appVersion: appVersionFromCoreArguments(process.argv),
          readTelemetry:
            localDatabase === undefined
              ? undefined
              : registerTelemetryReader(
                  storageTelemetryReader(localDatabase.name, nodeStorageFileSystem),
                  () => salesStopOf(localDatabase),
                ),
          acceptedPush:
            localDatabase === undefined
              ? undefined
              : { log: new SqliteAcceptedPushLog(localDatabase), clock: { now } },
        });
        cloudReachability = nextCloudReachability(cloudReachability, attempt);
        const warning = pushWarningOf(attempt);
        if (warning !== undefined) {
          console.warn(warning, attempt);
        }
        return pushResultOf(attempt);
      },
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
        if (
          attempt.kind === "page_out_of_order" ||
          (attempt.kind === "failed" && attempt.failure.kind !== "unreachable")
        ) {
          console.warn("core: the pull stopped before catching up", attempt);
        }
        return pullResultOf(attempt);
      },
      onCheckFailure: (error) => reportFailure("the installation check", error),
      onPushFailure: (error) => reportFailure("the push", error),
      onPruneFailure: (error) => reportFailure("the outbox pruning", error),
    }),
  intervalMs: SYNC_INTERVAL_MS,
  failureBackoff: SYNC_FAILURE_BACKOFF,
  random: Math.random,
  scheduleNext: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
  onFailure: reportSyncFailure,
  afterEachSync: () => rendererConnection.tell(PULLED_NOTICE),
});

const readDeviceToken = async () => (await mainRequests.readCredentials())?.device_token;
const realTimeAuthorization = createRealTimeAuthorization({
  database: localDatabase,
  cloudClient,
  readDeviceToken,
  now,
  reportFailure: (error) => reportFailure("the real-time authorization", error),
});

const rendererRequestDeps: RendererRequestDeps = {
  credentialsPresent: () => mainRequests.credentialsPresent(),
  registerStatus:
    localDatabase === undefined
      ? undefined
      : () => registerStatusFor({ database: localDatabase, cloud: () => cloudReachability, now }),
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
        storeCredentials: (credentials) => mainRequests.storeCredentials(credentials),
        now,
      },
      typedCode,
    );
    if (outcome.kind === "enrolled") {
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
    localDatabase === undefined ? undefined : () => sessionOpenSaleFor(localDatabase),
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
          scanProductFor({ database: localDatabase, gate: actionGate, now, ids: uuidV7Ids }, code),
  changeLineQuantity:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (lineId, quantity, expectedQuantity) =>
          changeLineQuantityFor(
            { database: localDatabase, gate: actionGate, now },
            lineId,
            quantity,
            expectedQuantity,
          ),
  removeSaleLine:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (lineId) => removeSaleLineFor({ database: localDatabase, gate: actionGate, now }, lineId),
  cancelSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () => cancelSaleFor({ database: localDatabase, gate: actionGate }),
  cancelPaidSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : async (request) =>
          cancelPaidSaleFor(
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
  chargeSaleInCash:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          chargeSaleInCashFor(
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
  chargeSaleByTransfer:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          chargeSaleByTransferFor(
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
  searchProducts:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (query) => searchProductsFor({ database: localDatabase, gate: actionGate, now }, query),
  addProduct:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (productId) =>
          addSearchedProductFor(
            { database: localDatabase, gate: actionGate, now, ids: uuidV7Ids },
            productId,
          ),
  currentSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () => currentSaleFor({ database: localDatabase, gate: actionGate, now }),
  cashCharge:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) => cashChargeFor({ database: localDatabase, gate: actionGate, now }, request),
  reportFailure,
};

const answeredRendererRequestDeps: RendererRequestDeps = {
  ...rendererRequestDeps,
  chargeSaleInCash: realTimeAuthorization.afterCompletedSale(rendererRequestDeps.chargeSaleInCash),
  chargeSaleByTransfer: realTimeAuthorization.afterCompletedSale(
    rendererRequestDeps.chargeSaleByTransfer,
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
});

if (cloudClient !== undefined) {
  startDeviceTokenRotationSchedule({
    rotate: () =>
      rotateDeviceToken({
        readCredentials: () => mainRequests.readCredentials(),
        postToCloud: (path, bearerToken) => postToCloudWithBearer(cloudClient, path, bearerToken),
        replaceCredentials: (expectedDeviceToken, credentials) =>
          mainRequests.replaceCredentials(expectedDeviceToken, credentials),
        now,
      }),
    schedule: (run, delayMs) => {
      const id = setTimeout(run, delayMs);
      return () => clearTimeout(id);
    },
  });
}

const rendererConnection = createRendererConnection(
  (data, reply) => {
    gateFromRenderer(data, (message) => {
      void answerRendererRequest(answeredRendererRequestDeps, message).then((answer) => {
        if (answer !== undefined) {
          reply(answer);
        }
      });
    });
  },
  () => signedInPerson.clear(),
);

process.parentPort.on("message", (event) => {
  const [rendererPort] = event.ports;
  if (rendererPort) {
    rendererConnection.adopt(rendererPort);
    return;
  }
  gateFromMain(event.data, (message) => mainRequests.receive(message));
});

process.parentPort.postMessage({ type: "core-ready" } satisfies CoreReadyMessage);
syncSchedule.start();
