import {
  snapshotBackupRegistersSchema,
  snapshotBackupsSchema,
  snapshotKeyRotationSchema,
  snapshotLifecycleRulesSchema,
} from "@purosur/contracts";
import {
  changeSnapshotLifecycleRules,
  listSnapshotBackupRegisters,
  registerSnapshotBackups,
  rotateRegisterSnapshotKey,
} from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { requirePasskeyAuthorization } from "../credentials/passkey-authorization-guard.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleSnapshotBackupsReader } from "./drizzle-snapshot-backups-reader.js";
import { DrizzleSnapshotKeyRotationStore } from "./drizzle-snapshot-key-rotation-store.js";
import { DrizzleSnapshotLifecycleRulesStore } from "./drizzle-snapshot-lifecycle-rules-store.js";
import { generateInstallationKey } from "./installation-key.js";
import { installationKeyCipher } from "./installation-key-cipher.js";

export interface SnapshotBackupsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  keysEncryptionKey: Uint8Array;
  now: () => Date;
}

const REGISTER_NOT_FOUND_RESPONSE = {
  code: "register_not_found",
  message: "no register has that id",
} as const;

const NO_KEY_YET_RESPONSE = {
  code: "no_key_yet",
  message: "the register has not been handed a snapshot key yet",
} as const;

export function registerSnapshotBackupsRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: SnapshotBackupsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const preHandler = sameOriginGuard(options.backofficeOrigin);
  const config = { access: capabilityAccess("backups_area"), sessionSource };
  const reader = new DrizzleSnapshotBackupsReader(options.db);
  const lifecycleRules = new DrizzleSnapshotLifecycleRulesStore(options.db, now);
  const keyRotation = new DrizzleSnapshotKeyRotationStore(
    options.db,
    installationKeyCipher(options.keysEncryptionKey),
    now,
  );

  app.get("/snapshot-backups/registers", { preHandler, config }, async (_request, reply) => {
    const registers = await listSnapshotBackupRegisters({ reader });
    await reply.code(200).send(snapshotBackupRegistersSchema.parse({ registers }));
  });

  app.get(
    "/snapshot-backups/registers/:registerId",
    { preHandler, config },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["registerId"]);
      if (!ids) {
        return;
      }

      const outcome = await registerSnapshotBackups(
        { reader, clock: { now } },
        { registerId: ids.registerId },
      );
      if (outcome.kind === "register_not_found") {
        await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send(
        snapshotBackupsSchema.parse({
          rules: outcome.rules,
          tiers: outcome.tiers,
          generations: outcome.generations.map((generation) => ({
            id: generation.id,
            created_at: generation.createdAt.toISOString(),
            size: generation.size,
            status: generation.status,
            failure_reason: generation.failureReason,
            key_version: generation.keyVersion,
            counts_for_restore: generation.countsForRestore,
          })),
        }),
      );
    },
  );

  app.put("/snapshot-backups/lifecycle-rules", { preHandler, config }, async (request, reply) => {
    const attemptedAt = now();
    const openSession = openSessionOf(request);

    const body = await readValidatedBody(reply, snapshotLifecycleRulesSchema, request.body);
    if (!body) {
      return;
    }

    if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
      return;
    }

    const outcome = await changeSnapshotLifecycleRules(
      { store: lifecycleRules },
      { rules: body, actorId: openSession.userId },
    );
    if (outcome.kind === "out_of_limits") {
      await reply.code(400).send({
        code: "validation_failed",
        message: "the lifecycle rules are outside the allowed limits",
        details: [],
      });
      return;
    }

    await reply.code(200).send(snapshotLifecycleRulesSchema.parse(body));
  });

  app.post(
    "/snapshot-backups/registers/:registerId/key-rotations",
    { preHandler, config },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["registerId"]);
      if (!ids) {
        return;
      }
      const openSession = openSessionOf(request);

      if (!(await requirePasskeyAuthorization(openSession, reply, now()))) {
        return;
      }

      const outcome = await rotateRegisterSnapshotKey(
        { store: keyRotation, keys: { generate: generateInstallationKey } },
        { registerId: ids.registerId, actorId: openSession.userId },
      );
      if (outcome.kind === "register_not_found") {
        await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "no_key_yet") {
        await reply.code(409).send(NO_KEY_YET_RESPONSE);
        return;
      }

      await reply
        .code(200)
        .send(snapshotKeyRotationSchema.parse({ key_version: outcome.keyVersion }));
    },
  );
}
