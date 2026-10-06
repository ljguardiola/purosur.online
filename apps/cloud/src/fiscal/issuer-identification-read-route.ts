import { type IssuerIdentificationBody, issuerIdentificationSchema } from "@purosur/contracts";
import { ISSUER_TAX_STATUS } from "@purosur/domain";
import type { AuthorizedIssuerIdentification } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { DrizzleIssuerIdentificationReader } from "./drizzle-issuer-identification-reader.js";

export interface IssuerIdentificationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  // From deployment configuration (ARCA_CERTIFICATE); never accepted from a client.
  authorizedCuit: string;
  now: () => Date;
}

export function toIssuerIdentificationWire(
  identification: AuthorizedIssuerIdentification,
): IssuerIdentificationBody {
  return {
    legal_name: identification.legalName,
    gross_income_registration: identification.grossIncomeRegistration,
    activity_start_date: identification.activityStartDate,
    authorized_cuit: identification.authorizedCuit,
    tax_status: ISSUER_TAX_STATUS,
    version: identification.version,
  };
}

export function registerIssuerIdentificationReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: IssuerIdentificationRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleIssuerIdentificationReader(options.db);

  app.get(
    "/fiscal-settings/issuer-identification",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (_request, reply) => {
      const identification = await reader.currentIssuerIdentification();
      await reply.code(200).send(
        issuerIdentificationSchema.parse(
          toIssuerIdentificationWire({
            ...identification,
            authorizedCuit: options.authorizedCuit,
          }),
        ),
      );
    },
  );
}
