import { userPinCodeSchema } from "@purosur/contracts";
import { mayEmitPinCodeFor, mayRequestPinCodeFor } from "@purosur/domain";
import { emitUserPinCode } from "@purosur/domain/access/use-cases";
import { findBranchUser } from "@purosur/domain/users/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard } from "./backoffice-origin.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";
import { DrizzlePinCodeStore } from "./drizzle-pin-code-store.js";
import { requirePasskeyAuthorization } from "./passkey-authorization-guard.js";
import { generatePinCode } from "./pin-code-generator.js";
import {
  openSessionOf,
  recordAccess,
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
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/users/:id/pin-codes",
    {
      preHandler: backofficeOriginGuard(options.backofficeOrigin),
      config: { access: recordAccess("id", mayRequestPinCodeFor), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const attemptedAt = now();
      const openSession = openSessionOf(request);
      const actor = { id: openSession.userId, isAdministrator: openSession.isAdministrator };

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const target = await findBranchUser(
        { users: drizzleBranchUsers(options.db) },
        { locationId: openSession.locationId, userId: ids.id, activeScope: "any" },
      );
      if (
        !target ||
        !mayEmitPinCodeFor(actor, { id: target.id, isAdministrator: target.roleIsAdministrator })
      ) {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      const outcome = await emitUserPinCode(
        {
          store: new DrizzlePinCodeStore(options.db, () => attemptedAt, openSession.locationId),
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
