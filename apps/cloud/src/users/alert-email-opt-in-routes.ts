import { type AlertEmailOptInWire, alertEmailOptInSchema } from "@purosur/contracts";
import {
  findOwnAlertEmailOptIn,
  recordOwnAlertEmailOptIn,
  withdrawOwnAlertEmailOptIn,
  withdrawUserAlertEmailOptIn,
} from "@purosur/domain/users/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { AUTHORIZATION_REQUIRED_RESPONSE } from "../credentials/passkey-authorization-guard.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { backofficeOriginGuard, sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  OPEN_SESSION_ACCESS,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { drizzleAlertEmailOptInReads } from "./drizzle-alert-email-opt-in-reads.js";
import { DrizzleAlertEmailOptInStore } from "./drizzle-alert-email-opt-in-store.js";
import type { UsersRouteOptions } from "./users-list-route.js";

const USER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no active user with that id belongs to this branch",
} as const;

const OWN_ACCOUNT_RESPONSE = {
  code: "own_account",
  message: "use Mi cuenta to manage your own opt-in to alerts by email",
} as const;

function toWire(optedInAt: Date | null): AlertEmailOptInWire {
  return alertEmailOptInSchema.parse({ opted_in_at: optedInAt?.toISOString() ?? null });
}

export function registerAlertEmailOptInRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: UsersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const mutationGuard = backofficeOriginGuard(options.backofficeOrigin);
  const store = () => new DrizzleAlertEmailOptInStore(options.db, now);

  app.get(
    "/account/alert-email-opt-in",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: OPEN_SESSION_ACCESS, sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const found = await findOwnAlertEmailOptIn(
        { reads: drizzleAlertEmailOptInReads(options.db) },
        { userId: openSession.userId, locationId: openSession.locationId },
      );

      await reply.code(200).send(toWire(found?.optedInAt ?? null));
    },
  );

  app.put(
    "/account/alert-email-opt-in",
    { preHandler: mutationGuard, config: { access: OPEN_SESSION_ACCESS, sessionSource } },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const outcome = await recordOwnAlertEmailOptIn(
        { store: store() },
        {
          userId: openSession.userId,
          locationId: openSession.locationId,
          passkeyAuthorizedAt: openSession.passkeyAuthorizedAt,
          at: now(),
        },
      );
      if (outcome.kind === "authorization_required") {
        await reply.code(401).send(AUTHORIZATION_REQUIRED_RESPONSE);
        return;
      }
      if (outcome.kind === "not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "recorded") {
        await reply.code(200).send(toWire(outcome.optedInAt));
        return;
      }

      const stored = await findOwnAlertEmailOptIn(
        { reads: drizzleAlertEmailOptInReads(options.db) },
        { userId: openSession.userId, locationId: openSession.locationId },
      );
      await reply.code(200).send(toWire(stored?.optedInAt ?? null));
    },
  );

  app.delete(
    "/account/alert-email-opt-in",
    { preHandler: mutationGuard, config: { access: OPEN_SESSION_ACCESS, sessionSource } },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const outcome = await withdrawOwnAlertEmailOptIn(
        { store: store() },
        {
          userId: openSession.userId,
          locationId: openSession.locationId,
          passkeyAuthorizedAt: openSession.passkeyAuthorizedAt,
          at: now(),
        },
      );
      if (outcome.kind === "authorization_required") {
        await reply.code(401).send(AUTHORIZATION_REQUIRED_RESPONSE);
        return;
      }
      if (outcome.kind === "not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }

      await reply.code(200).send(toWire(null));
    },
  );

  app.delete(
    "/users/:id/alert-email-opt-in",
    {
      preHandler: mutationGuard,
      config: { access: capabilityAccess("manage_users"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const openSession = openSessionOf(request);

      const outcome = await withdrawUserAlertEmailOptIn(
        { store: store() },
        {
          locationId: openSession.locationId,
          administratorId: openSession.userId,
          targetUserId: ids.id,
          passkeyAuthorizedAt: openSession.passkeyAuthorizedAt,
          at: now(),
        },
      );
      if (outcome.kind === "authorization_required") {
        await reply.code(401).send(AUTHORIZATION_REQUIRED_RESPONSE);
        return;
      }
      if (outcome.kind === "user_not_found") {
        await reply.code(404).send(USER_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "own_account") {
        await reply.code(403).send(OWN_ACCOUNT_RESPONSE);
        return;
      }

      await reply.code(200).send(toWire(null));
    },
  );
}
