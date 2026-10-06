import {
  cloudError,
  cloudErrorStatus,
  PUSH_EVENTS_REQUEST_MAX_BYTES,
  type PushEventsResponse,
  pushEventsRequestSchema,
  pushEventsResponseSchema,
} from "@purosur/contracts";
import {
  type ReceivePushedEventsOutcome,
  receivePushedEvents,
} from "@purosur/domain/sync/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { PUBLIC_ACCESS } from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import { installationKeyCipher } from "../register/installation-key-cipher.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { DrizzleInbox } from "./drizzle-inbox.js";
import { hmacEventChain } from "./hmac-event-chain.js";

export type EventsRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult>;

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

const REVOKED = cloudError("revoked", "this installation was revoked");

function toPushWire(
  outcome: Exclude<ReceivePushedEventsOutcome, { kind: "chain_broken" }>,
): PushEventsResponse {
  switch (outcome.kind) {
    case "received":
      return { status: "ok", ack_seq: outcome.ackSeq };
    case "gap":
      return {
        status: "expected_seq",
        ack_seq: outcome.ackSeq,
        expected_seq: outcome.expectedSeq,
      };
    case "stale_device":
      return { status: "stale_device", ack_seq: outcome.ackSeq };
  }
}

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerEventsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: EventsRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const ports = {
    inbox: new DrizzleInbox(options.db, installationKeyCipher(options.keysEncryptionKey)),
    eventChain: hmacEventChain,
    clock: { now: options.now ?? (() => new Date()) },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/events",
      { bodyLimit: PUSH_EVENTS_REQUEST_MAX_BYTES, config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
        if (authentication.kind !== "installation") {
          await reply
            .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
            .header("WWW-Authenticate", "Bearer")
            .send(DEVICE_TOKEN_REJECTED);
          return;
        }
        if (authentication.installation.revoked) {
          await reply.code(cloudErrorStatus(REVOKED.code)).send(REVOKED);
          return;
        }

        const push = await readValidatedBody(reply, pushEventsRequestSchema, request.body);
        if (!push) {
          return;
        }

        const outcome = await receivePushedEvents(ports, {
          deviceId: authentication.installation.deviceId,
          appVersion: push.app_version,
          telemetry: push.telemetry,
          events: push.events,
        });
        if (outcome.kind === "chain_broken") {
          await reply.code(cloudErrorStatus(REVOKED.code)).send(REVOKED);
          return;
        }
        await reply.code(200).send(pushEventsResponseSchema.parse(toPushWire(outcome)));
      },
    );
  });
}
