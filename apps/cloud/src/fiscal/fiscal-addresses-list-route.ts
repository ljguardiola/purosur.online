import { fiscalAddressListSchema } from "@purosur/contracts";
import type { FiscalAddress } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleFiscalAddressReader } from "./drizzle-fiscal-address-reader.js";

export interface FiscalAddressesRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

export function toFiscalAddressWire({ id, name, streetAddress, version }: FiscalAddress) {
  return { id, name, street_address: streetAddress, version };
}

export function registerFiscalAddressesListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: FiscalAddressesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  const reader = new DrizzleFiscalAddressReader(options.db);
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/fiscal-addresses",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (_request, reply) => {
      const listed = await reader.listFiscalAddresses();
      await reply.code(200).send(fiscalAddressListSchema.parse(listed.map(toFiscalAddressWire)));
    },
  );
}
