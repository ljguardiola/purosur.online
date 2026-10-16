import { registerRevocationSchema } from "@purosur/contracts";
import { revokeLostRegister } from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { requirePasskeyAuthorization } from "../credentials/passkey-authorization-guard.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleLostRegisterRevocationStore } from "./drizzle-lost-register-revocation-store.js";
import { generateInstallationKey } from "./installation-key.js";
import { installationKeyCipher } from "./installation-key-cipher.js";

export interface RegisterRevocationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  keysEncryptionKey: Uint8Array;
  now: () => Date;
}

const REGISTER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no register with that id belongs to this branch",
} as const;

const NO_ACTIVE_INSTALLATION_RESPONSE = {
  code: "no_active_installation",
  message: "the register has no installation in service to revoke",
} as const;

export function registerRegisterRevocationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegisterRevocationRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleLostRegisterRevocationStore(
    options.db,
    installationKeyCipher(options.keysEncryptionKey),
    now,
  );

  app.post(
    "/registers/:id/revocations",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("revoke_installations"), sessionSource },
    },
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

      const outcome = await revokeLostRegister(
        { store, clock: { now: () => attemptedAt }, keys: { generate: generateInstallationKey } },
        { branchId: openSession.locationId, registerId: ids.id, actorId: openSession.userId },
      );

      switch (outcome.kind) {
        case "register_not_found":
          await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
          return;
        case "no_active_installation":
          await reply.code(409).send(NO_ACTIVE_INSTALLATION_RESPONSE);
          return;
        case "revoked":
          await reply
            .code(200)
            .send(registerRevocationSchema.parse({ revoked_at: outcome.revokedAt.toISOString() }));
          return;
      }
    },
  );
}
