import {
  qrPointOfSaleAssignmentBodySchema,
  qrPointOfSaleAssignmentSchema,
} from "@purosur/contracts";
import { assignQrPointOfSale } from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleQrPointOfSaleAssignmentStore } from "./drizzle-qr-point-of-sale-assignment-store.js";

export interface RegisterQrPointOfSaleRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

const REGISTER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no register with that id belongs to this branch",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this register's QR point of sale was changed since it was loaded",
} as const;

const QR_POINT_OF_SALE_TAKEN_RESPONSE = {
  code: "qr_point_of_sale_taken",
  message: "that QR point of sale is already assigned to another register",
  details: [{ field: "external_pos_id" }],
} as const;

const INVALID_EXTERNAL_POS_ID_RESPONSE = {
  code: "validation_failed",
  message: "external_pos_id must be a QR point of sale id without spaces",
  details: [{ field: "external_pos_id" }],
} as const;

export function registerRegisterQrPointOfSaleRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegisterQrPointOfSaleRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleQrPointOfSaleAssignmentStore(options.db, now);

  app.put(
    "/registers/:id/qr-point-of-sale",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const openSession = openSessionOf(request);

      const body = await readValidatedBody(reply, qrPointOfSaleAssignmentBodySchema, request.body);
      if (!body) {
        return;
      }

      const outcome = await assignQrPointOfSale(store, {
        locationId: openSession.locationId,
        registerId: ids.id,
        externalPosId: body.external_pos_id,
        version: body.version,
        actorId: openSession.userId,
      });

      switch (outcome.kind) {
        case "register_not_found":
          await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
          return;
        case "stale_version":
          await reply.code(409).send(STALE_VERSION_RESPONSE);
          return;
        case "qr_point_of_sale_taken":
          await reply.code(409).send(QR_POINT_OF_SALE_TAKEN_RESPONSE);
          return;
        case "invalid_external_pos_id":
          await reply.code(400).send(INVALID_EXTERNAL_POS_ID_RESPONSE);
          return;
        case "assigned":
        case "unchanged":
          await reply.code(200).send(
            qrPointOfSaleAssignmentSchema.parse({
              register_id: ids.id,
              external_pos_id: outcome.assignment.externalPosId,
              version: outcome.assignment.version,
            }),
          );
          return;
      }
    },
  );
}
