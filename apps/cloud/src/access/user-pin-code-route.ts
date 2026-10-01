import { userPinCodeSchema } from "@purosur/contracts";
import { mayEmitPinCodeFor } from "@purosur/domain";
import { emitUserPinCode, findBranchUser } from "@purosur/domain/access/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import { DrizzlePinCodeStore } from "./drizzle-pin-code-store.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import { generatePinCode } from "./pin-code-generator.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "./route-access.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no user with that id belongs to this branch",
} as const;

export function registerUserPinCodeRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post<{ Params: { id: string } }>(
    "/users/:id/pin-codes",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("reset_user_pin"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);
      const actor = { id: openSession.userId, isAdministrator: openSession.isAdministrator };

      const target = UUID_PATTERN.test(request.params.id)
        ? await findBranchUser(
            { users: drizzleBranchUsers(options.db) },
            { locationId: openSession.locationId, userId: request.params.id, activeScope: "any" },
          )
        : undefined;
      if (
        !target ||
        !mayEmitPinCodeFor(actor, { id: target.id, isAdministrator: target.roleIsAdministrator })
      ) {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await emitUserPinCode(
        {
          store: new DrizzlePinCodeStore(options.db, openSession.locationId),
          clock: { now: () => attemptedAt },
          codes: { generate: generatePinCode },
        },
        { actor, targetId: target.id },
      );

      switch (outcome.kind) {
        case "not_found":
          await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
          return;
        case "inactive":
          await reply.code(409).send({
            code: "user_inactive",
            message: "the user is inactive, so no PIN code can be emitted for them",
          });
          return;
        case "rate_limited":
          await reply
            .header("Retry-After", String(outcome.retryAfterSeconds))
            .code(429)
            .send({ code: "rate_limited", message: "too many PIN codes emitted for this user" });
          return;
        case "emitted":
          await reply.code(201).send(
            userPinCodeSchema.parse({
              code: outcome.code,
              expires_at: outcome.expiresAt.toISOString(),
            }),
          );
          return;
      }
    },
  );
}
