import { registerCreationBodySchema } from "@purosur/contracts";
import { createRegister } from "@purosur/domain/register/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { requirePasskeyAuthorization } from "../credentials/passkey-authorization-guard.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { backofficeOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleBranchRegisterStore } from "./drizzle-branch-register-store.js";
import type { RegistersRouteOptions } from "./registers-list-route.js";

const REGISTER_NAME_TAKEN_RESPONSE = {
  code: "register_name_taken",
  message: "a register with that name already exists in this branch",
} as const;

export function registerRegisterCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegistersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleBranchRegisterStore(options.db, now);

  app.post(
    "/registers",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("registers_area"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const parsedBody = await readValidatedBody(reply, registerCreationBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await createRegister(store, {
        locationId: openSession.locationId,
        name: parsedBody.name,
        actorId: openSession.userId,
      });

      if (outcome.kind === "name_taken") {
        await reply.code(409).send(REGISTER_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(outcome.register);
    },
  );
}
