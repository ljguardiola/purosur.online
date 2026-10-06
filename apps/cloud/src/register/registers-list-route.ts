import { type RegisterSummaryBody, registerListSchema } from "@purosur/contracts";
import {
  type BranchRegisterSummary,
  listBranchRegisters,
} from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleBranchRegisterStore } from "./drizzle-branch-register-store.js";

export interface RegistersRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

function toRegisterWire(register: BranchRegisterSummary): RegisterSummaryBody {
  return {
    id: register.id,
    name: register.name,
    pending_code: register.pendingCode
      ? {
          seconds_since_issued: register.pendingCode.secondsSinceIssued,
          seconds_until_expiry: register.pendingCode.secondsUntilExpiry,
        }
      : null,
    point_of_sale_number: register.pointOfSaleNumber,
  };
}

export function registerRegistersListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegistersRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const registers = new DrizzleBranchRegisterStore(options.db);

  app.get(
    "/registers",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("registers_area"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const listed = await listBranchRegisters(
        { registers, clock: { now } },
        { locationId: openSession.locationId },
      );
      await reply.code(200).send(registerListSchema.parse(listed.map(toRegisterWire)));
    },
  );
}
