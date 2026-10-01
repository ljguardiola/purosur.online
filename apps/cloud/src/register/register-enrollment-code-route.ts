import { registerEnrollmentCodeSchema } from "@purosur/contracts";
import { emitEnrollmentCode } from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { backofficeOriginGuard } from "../access/backoffice-origin.js";
import { requirePasskeyAuthorization } from "../access/passkey-authorization-guard.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
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
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleBranchRegisterStore(options.db);

  app.post<{ Params: { id: string } }>(
    "/registers/:id/device-codes",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("enroll_register_devices"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      if (!(await store.hasRegister(openSession.locationId, request.params.id))) {
        await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await emitEnrollmentCode(
        { store, clock: { now: () => attemptedAt }, codes: secretEnrollmentCodes },
        {
          locationId: openSession.locationId,
          registerId: request.params.id,
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
