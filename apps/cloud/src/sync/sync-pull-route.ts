import {
  cloudError,
  cloudErrorStatus,
  type SyncPullPage,
  syncPullPageSchema,
  syncPullQuerySchema,
} from "@purosur/contracts";
import { type PullPage, pullChanges } from "@purosur/domain/sync/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { PUBLIC_ACCESS } from "../access/route-access.js";
import { toBranchSettingsWire } from "../branch/branch-settings-read-route.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import { DrizzleChangeLog, type PulledBranchSettingsChange } from "./drizzle-change-log.js";

export interface SyncPullRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  now?: () => Date;
}

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);

function toSyncPullPageWire(page: PullPage<PulledBranchSettingsChange>): SyncPullPage {
  return {
    changes: page.changes.map((change) => ({
      change_seq: change.changeSeq,
      entity: change.entity,
      entity_id: change.entityId,
      row: toBranchSettingsWire(change.row),
    })),
    cursor: page.cursor,
    has_more: page.hasMore,
  };
}

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerSyncPullRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SyncPullRouteOptions<TQueryResult>,
): void {
  const ports = {
    changeLog: new DrizzleChangeLog(options.db),
    clock: { now: options.now ?? (() => new Date()) },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.get("/sync/pull", { config: { access: PUBLIC_ACCESS } }, async (request, reply) => {
      const authentication = await authenticateDevice(options.db, request.headers.authorization);
      if (authentication.kind !== "installation" || authentication.installation.revoked) {
        await reply
          .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
          .header("WWW-Authenticate", "Bearer")
          .send(DEVICE_TOKEN_REJECTED);
        return;
      }

      const query = await readValidatedBody(reply, syncPullQuerySchema, request.query);
      if (!query) {
        return;
      }

      const page = await pullChanges(ports, {
        deviceId: authentication.installation.deviceId,
        locationId: authentication.installation.locationId,
        since: query.since,
      });
      await reply.code(200).send(syncPullPageSchema.parse(toSyncPullPageWire(page)));
    });
  });
}
