import {
  cloudError,
  cloudErrorStatus,
  type RestoredRegisterOrphanSweepResponseBody,
  restoredRegisterOrphanSweepResponseSchema,
} from "@purosur/contracts";
import {
  type SweepRestoredRegisterOrphanAuthorizationsOutcome,
  sweepRestoredRegisterOrphanAuthorizations,
} from "@purosur/domain/fiscal/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import {
  DrizzleRegisterFiscalPointsOfSale,
  DrizzleRestoredRegisterOrphanLanes,
} from "./drizzle-restored-register-orphan-lanes.js";
import type { EnqueueCreditNote } from "./enqueue-credit-note.js";

export type RestoredRegisterOrphanSweepRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult> & {
    connections: DedicatedConnections<TQueryResult>;
    enqueueCreditNote: EnqueueCreditNote;
  };

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

function toWire(
  outcome: SweepRestoredRegisterOrphanAuthorizationsOutcome,
): RestoredRegisterOrphanSweepResponseBody {
  switch (outcome.kind) {
    case "swept":
      return {
        state: "SWEPT",
        credit_noted_numbers: outcome.creditNotedNumbers,
        alerted_numbers: outcome.alertedNumbers,
      };
    case "numbering_not_reconciled":
      return { state: "NUMBERING_NOT_RECONCILED" };
  }
}

export function registerRestoredRegisterOrphanSweepRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RestoredRegisterOrphanSweepRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const ports = {
    points: new DrizzleRegisterFiscalPointsOfSale(options.db),
    lanes: new DrizzleRestoredRegisterOrphanLanes(
      options.connections,
      options.enqueueCreditNote,
      options.now,
    ),
    clock: { now: options.now },
    ids: { next: () => crypto.randomUUID() },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/devices/current/orphan-sweep",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
        if (authentication.kind !== "installation" || authentication.installation.revoked) {
          await reply
            .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
            .header("WWW-Authenticate", "Bearer")
            .send(DEVICE_TOKEN_REJECTED);
          return;
        }

        const outcome = await sweepRestoredRegisterOrphanAuthorizations(ports, {
          registerId: authentication.installation.registerId,
        });

        await reply
          .code(200)
          .send(restoredRegisterOrphanSweepResponseSchema.parse(toWire(outcome)));
      },
    );
  });
}
