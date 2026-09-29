import { randomUUID } from "node:crypto";
import { hostname, release, version } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
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
import { createMessageGate, type RejectionRecorder, summarizeRejection } from "./message-gate";
import { type CloudClientDeps, getFromCloud, postToCloud } from "./platform/cloud-client";
import { openLocalDatabase } from "./platform/local-database";
import { LOCAL_MIGRATIONS } from "./platform/local-migrations";
import { createMainRequests } from "./platform/main-requests";
import { enroll, generatePepper, installationReportFrom } from "./register/enrollment";
import { answerRendererRequest } from "./register/renderer-requests";
import { createRendererConnection } from "./renderer-connection";
import { pullFromCloud } from "./sync/pull-from-cloud";
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
const PULL_INTERVAL_MS = 60_000;

function openLocalReplica(): SqliteLocalReplica | undefined {
  const localDataFolder = localDataFolderFromCoreArguments(process.argv);
  if (localDataFolder === undefined) {
    console.error("core: no local data folder was handed over, so it can't pull");
    return undefined;
  }
  try {
    return new SqliteLocalReplica(
      openLocalDatabase(join(localDataFolder, LOCAL_DATABASE_FILE), LOCAL_MIGRATIONS),
    );
  } catch (error) {
    console.error("core: the local database could not be opened, so it can't pull", error);
    return undefined;
  }
}

const replica = openLocalReplica();

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
  },
  intervalMs: PULL_INTERVAL_MS,
  scheduleNext: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
  onFailure: (error) => {
    console.error("core: the pull failed", error);
  },
});

const rendererRequestDeps = {
  credentialsPresent: () => mainRequests.credentialsPresent(),
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
      },
      typedCode,
    );
    if (outcome.kind === "enrolled") {
      pullSchedule.pullNow();
    }
    return outcome;
  },
};

const rendererConnection = createRendererConnection((data, reply) => {
  gateFromRenderer(data, (message) => {
    void answerRendererRequest(rendererRequestDeps, message).then((answer) => {
      if (answer !== undefined) {
        reply(answer);
      }
    });
  });
});

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
