import { randomUUID } from "node:crypto";
import { hostname, release, version } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  type CoreToRendererMessage,
  mainToCoreMessageSchema,
  rendererToCoreMessageSchema,
  scrubErrorReport,
  scrubErrorReportBreadcrumb,
  scrubErrorReportLog,
} from "@purosur/contracts";
import * as Sentry from "@sentry/electron/utility";
import { net } from "electron";
import {
  appVersionFromCoreArguments,
  cloudUrlFromCoreArguments,
  localDataFolderFromCoreArguments,
  sentryEnvironmentFromCoreArguments,
} from "../shared/channel";
import { CORE_READY_MESSAGE } from "../shared/core-readiness";
import { createActionGate } from "./access/action-gate";
import { requestFirstPinCode } from "./access/first-pin-code-request";
import { redeemPinCode } from "./access/pin-code-redemption";
import { hashPin } from "./access/pin-hash";
import { redeemedPerson } from "./access/redeemed-person";
import { applyRedeemedPin } from "./access/redeemed-pin";
import { firstSignIn, signIn } from "./access/sign-in";
import { lookUpSignIn } from "./access/sign-in-lookup";
import { createSignedInPerson } from "./access/signed-in-person";
import { SqliteSignInStore } from "./access/sqlite-sign-in-store";
import { createMessageGate, type RejectionRecorder, summarizeRejection } from "./message-gate";
import {
  type CloudClientDeps,
  getFromCloud,
  postToCloud,
  postToCloudWithBearer,
} from "./platform/cloud-client";
import { type LocalDatabase, openLocalDatabase } from "./platform/local-database";
import { LOCAL_MIGRATIONS } from "./platform/local-migrations";
import { createMainRequests } from "./platform/main-requests";
import {
  cashMovementKindsFor,
  currentCashMovements,
  recordCashMovementFor,
} from "./register/cash-movement-requests";
import {
  cashBalanceFor,
  closeCashSessionFor,
  closeLockedCashSessionFor,
  currentCashSession,
  identifyLockedCloserFor,
  lockedClosersFor,
  openCashSessionFor,
  sessionOpenSaleFor,
} from "./register/cash-session-requests";
import { rotateDeviceToken } from "./register/device-token-rotation";
import { startDeviceTokenRotationSchedule } from "./register/device-token-rotation-schedule";
import { enroll, generatePepper, installationReportFrom } from "./register/enrollment";
import { answerRendererRequest, type RendererRequestDeps } from "./register/renderer-requests";
import { readOpenSession } from "./register/sqlite-cash-ledger";
import { uuidV7Ids } from "./register/uuid-v7-ids";
import { createRendererConnection } from "./renderer-connection";
import {
  addSearchedProductFor,
  cancelLockedSaleFor,
  cancelSaleFor,
  cashChargeFor,
  changeLineQuantityFor,
  chargeSaleInCashFor,
  currentSaleFor,
  removeSaleLineFor,
  scanProductFor,
  searchProductsFor,
} from "./sales/sale-requests";
import { pullFromCloud, pullResultOf } from "./sync/pull-from-cloud";
import { pushResultOf, pushToCloud, pushWarningOf } from "./sync/push-to-cloud";
import { SqliteLocalOutbox } from "./sync/sqlite-local-outbox";
import { SqliteLocalReplica } from "./sync/sqlite-local-replica";
import { nodeStorageFileSystem, storageTelemetryReader } from "./sync/storage-telemetry";
import { runSyncCycle } from "./sync/sync-cycle";
import { createSyncSchedule } from "./sync/sync-schedule";

// No DSN here: @sentry/electron's utility SDK hands every envelope to main, which owns the
// destination and replaces the environment on events, but forwards logs untouched.
const sentryEnvironment = sentryEnvironmentFromCoreArguments(process.argv);
if (sentryEnvironment) {
  Sentry.init({
    environment: sentryEnvironment,
    enableLogs: true,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["info", "warn", "error"] })],
    beforeSend: scrubErrorReport,
    beforeBreadcrumb: scrubErrorReportBreadcrumb,
    beforeSendLog: scrubErrorReportLog,
  });
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

function handleMainMessage(): void {}

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

const LOCAL_DATABASE_FILE = "register.sqlite";
const SYNC_INTERVAL_MS = 30_000;
const SYNC_FAILURE_BACKOFF = { baseMs: 2000, maxMs: 60_000 };
const PULLED_NOTICE: CoreToRendererMessage = { type: "pulled" };

function openLocalDatabaseFile(): LocalDatabase | undefined {
  const localDataFolder = localDataFolderFromCoreArguments(process.argv);
  if (localDataFolder === undefined) {
    console.error("core: no local data folder was handed over, so it can't pull or sign anyone in");
    return undefined;
  }
  try {
    const database = openLocalDatabase(
      join(localDataFolder, LOCAL_DATABASE_FILE),
      LOCAL_MIGRATIONS,
    );
    console.info("core: the local database is ready");
    return database;
  } catch (error) {
    console.error(
      "core: the local database could not be opened, so it can't pull or sign anyone in",
      error,
    );
    Sentry.captureException(error);
    return undefined;
  }
}

const localDatabase = openLocalDatabaseFile();
const replica = localDatabase === undefined ? undefined : new SqliteLocalReplica(localDatabase);
const localOutbox =
  localDatabase === undefined ? undefined : new SqliteLocalOutbox(localDatabase, () => new Date());
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
        now: () => new Date(),
      });

function reportFailure(context: string, error: unknown): void {
  console.error(`core: ${context} failed`, error);
  Sentry.captureException(error);
}

// An unreachable cloud is how a register without internet looks, so only an unexpected stop is
// reported; the next cycle resumes from the cursor and the outbox already saved either way.
const syncSchedule = createSyncSchedule({
  syncOnce: () =>
    runSyncCycle({
      push: async () => {
        const attempt = await pushToCloud({
          readCredentials: () => mainRequests.readCredentials(),
          outbox: localOutbox,
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
              : storageTelemetryReader(localDatabase.name, nodeStorageFileSystem),
        });
        const warning = pushWarningOf(attempt);
        if (warning !== undefined) {
          console.warn(warning, attempt);
        }
        return pushResultOf(attempt);
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
      onPushFailure: (error) => reportFailure("the push", error),
    }),
  intervalMs: SYNC_INTERVAL_MS,
  failureBackoff: SYNC_FAILURE_BACKOFF,
  random: Math.random,
  scheduleNext: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
  onFailure: (error) => {
    console.error("core: the sync failed", error);
  },
  afterEachSync: () => rendererConnection.tell(PULLED_NOTICE),
});

const rendererRequestDeps: RendererRequestDeps = {
  credentialsPresent: () => mainRequests.credentialsPresent(),
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
        now: () => new Date(),
      },
      typedCode,
    );
    if (outcome.kind === "enrolled") {
      syncSchedule.syncNow();
    }
    return outcome;
  },
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
            : (pepper, redemption) => applyRedeemedPin(localDatabase, pepper, redemption),
        reportLocalFailure: (error) => {
          console.error("core: the redeemed PIN could not be kept locally", error);
          Sentry.captureException(error);
        },
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
    signInStore === undefined ? undefined : (permission) => signInStore.authorizers(permission),
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
              now: () => new Date(),
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
              now: () => new Date(),
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
              now: () => new Date(),
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
              now: () => new Date(),
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
              now: () => new Date(),
              ids: uuidV7Ids,
            },
            { sessionId, countedCash, closer },
          ),
  cancelLockedSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (closer) =>
          cancelLockedSaleFor(
            {
              database: localDatabase,
              gate: actionGate,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now: () => new Date(),
              ids: uuidV7Ids,
            },
            closer,
          ),
  identifyLockedCloser:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (closer) => identifyLockedCloserFor({ database: localDatabase, gate: actionGate }, closer),
  cashBalance: localDatabase === undefined ? undefined : () => cashBalanceFor(localDatabase),
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
              now: () => new Date(),
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
            { database: localDatabase, gate: actionGate, now: () => new Date(), ids: uuidV7Ids },
            code,
          ),
  changeLineQuantity:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (lineId, quantity, expectedQuantity) =>
          changeLineQuantityFor(
            { database: localDatabase, gate: actionGate, now: () => new Date(), ids: uuidV7Ids },
            lineId,
            quantity,
            expectedQuantity,
          ),
  removeSaleLine:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (lineId) =>
          removeSaleLineFor(
            { database: localDatabase, gate: actionGate, now: () => new Date(), ids: uuidV7Ids },
            lineId,
          ),
  cancelSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () =>
          cancelSaleFor({
            database: localDatabase,
            gate: actionGate,
            readOutboxChainKey: async () =>
              (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
            now: () => new Date(),
            ids: uuidV7Ids,
          }),
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
              now: () => new Date(),
              ids: uuidV7Ids,
            },
            request,
          ),
  searchProducts:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (query) =>
          searchProductsFor(
            { database: localDatabase, gate: actionGate, now: () => new Date() },
            query,
          ),
  addProduct:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (productId) =>
          addSearchedProductFor(
            { database: localDatabase, gate: actionGate, now: () => new Date(), ids: uuidV7Ids },
            productId,
          ),
  currentSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () => currentSaleFor({ database: localDatabase, gate: actionGate, now: () => new Date() }),
  cashCharge:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : (request) =>
          cashChargeFor(
            { database: localDatabase, gate: actionGate, now: () => new Date() },
            request,
          ),
  reportFailure,
};

if (cloudClient !== undefined) {
  startDeviceTokenRotationSchedule({
    rotate: () =>
      rotateDeviceToken({
        readCredentials: () => mainRequests.readCredentials(),
        postToCloud: (path, bearerToken) => postToCloudWithBearer(cloudClient, path, bearerToken),
        replaceCredentials: (expectedDeviceToken, credentials) =>
          mainRequests.replaceCredentials(expectedDeviceToken, credentials),
        now: () => new Date(),
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
      void answerRendererRequest(rendererRequestDeps, message).then((answer) => {
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
  if (mainRequests.receive(event.data)) {
    return;
  }

  gateFromMain(event.data, handleMainMessage);
});

process.parentPort.postMessage(CORE_READY_MESSAGE);
syncSchedule.start();
