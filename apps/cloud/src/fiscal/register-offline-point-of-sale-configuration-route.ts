import {
  offlinePointOfSaleConfigurationBodySchema,
  registerOfflinePointOfSaleSchema,
} from "@purosur/contracts";
import { configureRegisterOfflinePointOfSale } from "@purosur/domain/fiscal/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
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
import { DrizzleRegisterOfflinePointOfSaleStore } from "./drizzle-register-offline-point-of-sale-store.js";
import type { RegistersPointsOfSaleRouteOptions } from "./registers-points-of-sale-list-route.js";

const REGISTER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no register with that id belongs to this branch",
} as const;

const REAL_TIME_POINT_OF_SALE_MISSING_RESPONSE = {
  code: "real_time_point_of_sale_missing",
  message: "the register needs its real-time point of sale before it can have an offline one",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this register's offline point of sale was changed since it was loaded",
} as const;

const POINT_OF_SALE_TAKEN_RESPONSE = {
  code: "point_of_sale_taken",
  message: "that point of sale number is already in use",
  details: [{ field: "point_of_sale_number" }],
} as const;

export function registerRegisterOfflinePointOfSaleConfigurationRoute<
  TQueryResult extends PgQueryResultHKT,
>(app: FastifyInstance, options: RegistersPointsOfSaleRouteOptions<TQueryResult>): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleRegisterOfflinePointOfSaleStore(options.db, now);

  app.put(
    "/registers/:id/offline-point-of-sale",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const body = await readValidatedBody(
        reply,
        offlinePointOfSaleConfigurationBodySchema,
        request.body,
      );
      if (!body) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await configureRegisterOfflinePointOfSale(store, {
        locationId: openSession.locationId,
        registerId: ids.id,
        pointOfSaleNumber: body.point_of_sale_number,
        version: body.version,
        actorId: openSession.userId,
      });

      if (outcome.kind === "register_not_found") {
        await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "real_time_point_of_sale_missing") {
        await reply.code(409).send(REAL_TIME_POINT_OF_SALE_MISSING_RESPONSE);
        return;
      }
      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "point_of_sale_taken") {
        await reply.code(409).send(POINT_OF_SALE_TAKEN_RESPONSE);
        return;
      }

      await reply.code(200).send(
        registerOfflinePointOfSaleSchema.parse({
          register_id: ids.id,
          point_of_sale_number: outcome.setup.pointOfSaleNumber,
          version: outcome.setup.version,
        }),
      );
    },
  );
}
