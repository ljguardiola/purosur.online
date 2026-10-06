import { pointOfSaleConfigurationBodySchema, registerPointOfSaleSchema } from "@purosur/contracts";
import { configureRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import { requirePasskeyAuthorization } from "../access/passkey-authorization-guard.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";
import type { RegistersPointsOfSaleRouteOptions } from "./registers-points-of-sale-list-route.js";

const REGISTER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no register with that id belongs to this branch",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this register's point of sale was changed since it was loaded",
} as const;

const POINT_OF_SALE_TAKEN_RESPONSE = {
  code: "point_of_sale_taken",
  message: "that point of sale number belongs to another register",
  details: [{ field: "point_of_sale_number" }],
} as const;

const FISCAL_ADDRESS_NOT_FOUND_RESPONSE = {
  code: "validation_failed",
  message: "fiscal_address_id must be the id of a fiscal address",
  details: [{ field: "fiscal_address_id" }],
} as const;

export function registerRegisterPointOfSaleConfigurationRoute<
  TQueryResult extends PgQueryResultHKT,
>(app: FastifyInstance, options: RegistersPointsOfSaleRouteOptions<TQueryResult>): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleRegisterPointOfSaleStore(options.db, now);

  app.put(
    "/registers/:id/point-of-sale",
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

      const body = await readValidatedBody(reply, pointOfSaleConfigurationBodySchema, request.body);
      if (!body) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await configureRegisterPointOfSale(store, {
        locationId: openSession.locationId,
        registerId: ids.id,
        pointOfSaleNumber: body.point_of_sale_number,
        fiscalAddressId: body.fiscal_address_id,
        version: body.version,
        actorId: openSession.userId,
      });

      if (outcome.kind === "register_not_found") {
        await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "fiscal_address_not_found") {
        await reply.code(400).send(FISCAL_ADDRESS_NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "point_of_sale_taken") {
        await reply.code(409).send(POINT_OF_SALE_TAKEN_RESPONSE);
        return;
      }

      await reply.code(200).send(
        registerPointOfSaleSchema.parse({
          register_id: ids.id,
          point_of_sale_number: outcome.setup.pointOfSaleNumber,
          fiscal_address_id: outcome.setup.fiscalAddressId,
          version: outcome.setup.version,
        }),
      );
    },
  );
}
