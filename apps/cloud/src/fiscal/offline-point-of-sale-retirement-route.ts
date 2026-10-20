import { offlinePointOfSaleRetirementSchema } from "@purosur/contracts";
import { isPointOfSaleNumber } from "@purosur/domain";
import { retireOfflinePointOfSale } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { requirePasskeyAuthorization } from "../credentials/passkey-authorization-guard.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleOfflinePointOfSaleRetirementStore } from "./drizzle-offline-point-of-sale-retirement-store.js";

export interface OfflinePointOfSaleRetirementRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

const INVALID_NUMBER_RESPONSE = {
  code: "validation_failed",
  message: "number must be a point of sale number",
  details: [{ field: "number" }],
} as const;

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no offline point of sale of this branch has that number",
} as const;

const ASSIGNED_RESPONSE = {
  code: "assigned",
  message: "a register has that offline point of sale assigned",
} as const;

const ALREADY_RETIRED_RESPONSE = {
  code: "already_retired",
  message: "that offline point of sale is already retired",
} as const;

function pointOfSaleNumberOf(params: unknown): number | undefined {
  const raw =
    typeof params === "object" && params !== null
      ? (params as { number?: unknown }).number
      : undefined;
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) {
    return undefined;
  }
  const number = Number(raw);
  return isPointOfSaleNumber(number) ? number : undefined;
}

export function registerOfflinePointOfSaleRetirementRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: OfflinePointOfSaleRetirementRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleOfflinePointOfSaleRetirementStore(options.db);

  app.post(
    "/registers/offline-points-of-sale/:number/retirement",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);
      const pointOfSaleNumber = pointOfSaleNumberOf(request.params);
      if (pointOfSaleNumber === undefined) {
        await reply.code(400).send(INVALID_NUMBER_RESPONSE);
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await retireOfflinePointOfSale(
        { store, clock: { now } },
        { locationId: openSession.locationId, pointOfSaleNumber, actorId: openSession.userId },
      );

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "assigned") {
        await reply.code(409).send(ASSIGNED_RESPONSE);
        return;
      }
      if (outcome.kind === "already_retired") {
        await reply.code(409).send(ALREADY_RETIRED_RESPONSE);
        return;
      }

      await reply.code(200).send(
        offlinePointOfSaleRetirementSchema.parse({
          point_of_sale_number: pointOfSaleNumber,
          retired_at: outcome.retiredAt.toISOString(),
        }),
      );
    },
  );
}
