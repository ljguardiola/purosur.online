import { registerEnrollmentCodeSchema } from "@purosur/contracts";
import { emitEnrollmentCode } from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
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
import { DrizzleBranchRegisterStore } from "./drizzle-branch-register-store.js";
import { secretEnrollmentCodes } from "./register-enrollment-code.js";
import type { RegistersRouteOptions } from "./registers-list-route.js";

const REGISTER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no register with that id belongs to this branch",
} as const;

export function registerRegisterEnrollmentCodeRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegistersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleBranchRegisterStore(options.db, now);

  app.post(
    "/registers/:id/device-codes",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("registers_area"), sessionSource },
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

      if (!(await store.hasRegister(openSession.locationId, ids.id))) {
        await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
        return;
      }

      const outcome = await emitEnrollmentCode(
        { store, clock: { now: () => attemptedAt }, codes: secretEnrollmentCodes },
        {
          locationId: openSession.locationId,
          registerId: ids.id,
          actorId: openSession.userId,
        },
      );

      if (outcome.kind === "register_not_found") {
        await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send(
        registerEnrollmentCodeSchema.parse({
          code: outcome.code,
          expires_at: outcome.expiresAt.toISOString(),
        }),
      );
    },
  );
}
