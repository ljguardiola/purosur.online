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
  cloudUrlFromCoreArguments,
  localDataFolderFromCoreArguments,
  sentryEnvironmentFromCoreArguments,
} from "../shared/channel";
import { CORE_READY_MESSAGE } from "../shared/core-readiness";
import { createActionGate } from "./access/action-gate";
import { requestFirstPinCode } from "./access/first-pin-code-request";
import { redeemPinCode } from "./access/pin-code-redemption";
import { hashPin } from "./access/pin-hash";
import { applyRedeemedPin } from "./access/redeemed-pin";
import { signInRedeemedPerson } from "./access/redeemed-sign-in";
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
import { currentCashMovements, recordCashMovementFor } from "./register/cash-movement-requests";
import {
  cashBalanceFor,
  cashSessionOpener,
  closeCashSessionFor,
  currentCashSession,
  openCashSessionFor,
} from "./register/cash-session-requests";
import { rotateDeviceToken } from "./register/device-token-rotation";
import { startDeviceTokenRotationSchedule } from "./register/device-token-rotation-schedule";
import { enroll, generatePepper, installationReportFrom } from "./register/enrollment";
import { answerRendererRequest, type RendererRequestDeps } from "./register/renderer-requests";
import { uuidV7Ids } from "./register/uuid-v7-ids";
import { createRendererConnection } from "./renderer-connection";
import {
  cancelSaleFor,
  changeLineQuantityFor,
  currentSaleFor,
  removeSaleLineFor,
  scanProductFor,
} from "./sales/sale-requests";
import { pullFromCloud, pullResultOf } from "./sync/pull-from-cloud";
import { createPullSchedule } from "./sync/pull-schedule";
import { SqliteLocalReplica } from "./sync/sqlite-local-replica";

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
const PULL_INTERVAL_MS = 30_000;
const PULL_FAILURE_BACKOFF = { baseMs: 2000, maxMs: 60_000 };
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
// reported; the next pull resumes from the cursor already saved either way.
const pullSchedule = createPullSchedule({
  pullOnce: async () => {
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
  intervalMs: PULL_INTERVAL_MS,
  failureBackoff: PULL_FAILURE_BACKOFF,
  random: Math.random,
  scheduleNext: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
  onFailure: (error) => {
    console.error("core: the pull failed", error);
  },
  afterEachPull: () => rendererConnection.tell(PULLED_NOTICE),
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
      pullSchedule.pullNow();
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
        cashSessionOpener: () =>
          localDatabase === undefined ? undefined : cashSessionOpener(localDatabase),
        signInRedeemed: (userId) =>
          signInStore === undefined
            ? undefined
            : signInRedeemedPerson({ store: signInStore, signedInPerson }, userId),
      },
      typedCode,
      newPin,
    ),
  signInUsers: signInStore === undefined ? undefined : () => signInStore.signableUsers(),
  authorizers:
    signInStore === undefined ? undefined : (permission) => signInStore.authorizers(permission),
  signIn:
    localDatabase === undefined || signInStore === undefined
      ? undefined
      : (userId, pin) =>
          signIn(
            {
              store: signInStore,
              signedInPerson,
              cashSessionOpener: () => cashSessionOpener(localDatabase),
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
              cashSessionOpener: () => cashSessionOpener(localDatabase),
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
              signedInPerson,
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
      : (sessionId, countedCash, authorization) =>
          closeCashSessionFor(
            {
              database: localDatabase,
              gate: actionGate,
              signedInPerson,
              readOutboxChainKey: async () =>
                (await mainRequests.readCredentials())?.keys?.outbox_chain_key,
              now: () => new Date(),
              ids: uuidV7Ids,
            },
            { sessionId, countedCash, authorization },
          ),
  cashBalance: localDatabase === undefined ? undefined : () => cashBalanceFor(localDatabase),
  cashSession: localDatabase === undefined ? undefined : () => currentCashSession(localDatabase),
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
      : (lineId, quantity) =>
          changeLineQuantityFor(
            { database: localDatabase, gate: actionGate, now: () => new Date(), ids: uuidV7Ids },
            lineId,
            quantity,
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
  currentSale:
    localDatabase === undefined || actionGate === undefined
      ? undefined
      : () => currentSaleFor({ database: localDatabase, gate: actionGate }),
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
pullSchedule.start();
