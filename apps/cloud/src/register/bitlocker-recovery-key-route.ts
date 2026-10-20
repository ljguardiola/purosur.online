import { bitlockerRecoveryKeyLoadBodySchema, bitlockerRecoveryKeySchema } from "@purosur/contracts";
import {
  consultBitlockerRecoveryKey,
  loadBitlockerRecoveryKey,
} from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { requirePasskeyAuthorization } from "../credentials/passkey-authorization-guard.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleBitlockerRecoveryKeyStore } from "./drizzle-bitlocker-recovery-key-store.js";
import { installationKeyCipher } from "./installation-key-cipher.js";

export interface BitlockerRecoveryKeyRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  keysEncryptionKey: Uint8Array;
  now: () => Date;
}

const REGISTER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no register with that id belongs to this branch",
} as const;

const NO_CURRENT_INSTALLATION_RESPONSE = {
  code: "no_current_installation",
  message: "the register has no installation in service",
} as const;

const ALREADY_LOADED_RESPONSE = {
  code: "already_loaded",
  message: "the installation in service already has its recovery key loaded",
} as const;

const NOT_LOADED_RESPONSE = {
  code: "not_loaded",
  message: "the installation in service has no recovery key loaded",
} as const;

export function registerBitlockerRecoveryKeyRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BitlockerRecoveryKeyRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleBitlockerRecoveryKeyStore(
    options.db,
    installationKeyCipher(options.keysEncryptionKey),
  );
  const routeConfig = {
    preHandler: backofficeOriginGuard(options.backofficeOrigin),
    config: { access: capabilityAccess("bitlocker_recovery_key"), sessionSource },
  };

  app.post("/registers/:id/bitlocker-recovery-key", routeConfig, async (request, reply) => {
    const ids = await readRecordIds(reply, request.params, ["id"]);
    if (!ids) {
      return;
    }
    const attemptedAt = now();
    const openSession = openSessionOf(request);

    const body = await readValidatedBody(reply, bitlockerRecoveryKeyLoadBodySchema, request.body);
    if (!body) {
      return;
    }
    if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
      return;
    }

    const outcome = await loadBitlockerRecoveryKey(
      { store, clock: { now: () => attemptedAt } },
      {
        branchId: openSession.locationId,
        registerId: ids.id,
        actorId: openSession.userId,
        recoveryKey: body.recovery_key,
        keyIdentifier: body.key_identifier,
      },
    );

    switch (outcome.kind) {
      case "register_not_found":
        await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
        return;
      case "no_current_installation":
        await reply.code(409).send(NO_CURRENT_INSTALLATION_RESPONSE);
        return;
      case "already_loaded":
        await reply.code(409).send(ALREADY_LOADED_RESPONSE);
        return;
      case "loaded":
        await reply.code(201).send();
        return;
    }
  });

  app.post(
    "/registers/:id/bitlocker-recovery-key/consultations",
    routeConfig,
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await consultBitlockerRecoveryKey(
        { store, clock: { now: () => attemptedAt } },
        { branchId: openSession.locationId, registerId: ids.id, actorId: openSession.userId },
      );

      switch (outcome.kind) {
        case "register_not_found":
          await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
          return;
        case "no_current_installation":
          await reply.code(409).send(NO_CURRENT_INSTALLATION_RESPONSE);
          return;
        case "not_loaded":
          await reply.code(409).send(NOT_LOADED_RESPONSE);
          return;
        case "consulted":
          await reply
            .code(200)
            .header("Cache-Control", "no-store")
            .send(
              bitlockerRecoveryKeySchema.parse({
                recovery_key: outcome.recoveryKey,
                key_identifier: outcome.keyIdentifier,
              }),
            );
          return;
      }
    },
  );
}
