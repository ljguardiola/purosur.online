import { randomUUID } from "node:crypto";
import { hostname, release, version } from "node:os";
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
import { cloudUrlFromCoreArguments, sentryEnvironmentFromCoreArguments } from "../shared/channel";
import { CORE_READY_MESSAGE } from "../shared/core-readiness";
import { createMessageGate, type RejectionRecorder, summarizeRejection } from "./message-gate";
import { postToCloud, postToCloudWithBearer } from "./platform/cloud-client";
import { createMainRequests } from "./platform/main-requests";
import { rotateDeviceToken } from "./register/device-token-rotation";
import { startDeviceTokenRotationSchedule } from "./register/device-token-rotation-schedule";
import { enroll, generatePepper, installationReportFrom } from "./register/enrollment";
import { answerRendererRequest } from "./register/renderer-requests";
import { createRendererConnection } from "./renderer-connection";

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

const cloudClient =
  cloudUrl === undefined
    ? undefined
    : { cloudUrl, fetch: (input: string, init: RequestInit) => net.fetch(input, init), sleep };

const rendererRequestDeps = {
  credentialsPresent: () => mainRequests.credentialsPresent(),
  enroll: (typedCode: string) =>
    enroll(
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
    ),
};

if (cloudClient !== undefined) {
  startDeviceTokenRotationSchedule({
    rotate: () =>
      rotateDeviceToken({
        readCredentials: () => mainRequests.readCredentials(),
        postToCloud: (path, bearerToken) => postToCloudWithBearer(cloudClient, path, bearerToken),
        storeCredentials: (credentials) => mainRequests.storeCredentials(credentials),
        now: () => new Date(),
      }),
    schedule: (run, delayMs) => {
      const id = setTimeout(run, delayMs);
      return () => clearTimeout(id);
    },
  });
}

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
