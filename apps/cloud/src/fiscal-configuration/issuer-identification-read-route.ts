import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { ISSUER_IDENTIFICATION_SINGLETON_ID, issuerIdentification } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";

export const ISSUER_IDENTIFICATION_TAX_STATUS = "Responsable Monotributo";

export interface IssuerIdentificationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  // From deployment configuration (ARCA_CERTIFICATE); never stored in the database or accepted from a client.
  authorizedCuit: string;
  now?: () => Date;
}

export interface IssuerIdentificationRow {
  legalName: string | null;
  grossIncomeRegistration: string | null;
  activityStartDate: string | null;
  version: number;
}

export type IssuerIdentificationWire = {
  legal_name: string | null;
  gross_income_registration: string | null;
  activity_start_date: string | null;
  authorized_cuit: string;
  tax_status: string;
  version: number;
};

export function toIssuerIdentificationWire(
  row: IssuerIdentificationRow,
  authorizedCuit: string,
): IssuerIdentificationWire {
  return {
    legal_name: row.legalName,
    gross_income_registration: row.grossIncomeRegistration,
    activity_start_date: row.activityStartDate,
    authorized_cuit: authorizedCuit,
    tax_status: ISSUER_IDENTIFICATION_TAX_STATUS,
    version: row.version,
  };
}

export async function findIssuerIdentification<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
): Promise<IssuerIdentificationRow> {
  const [row] = await db
    .select({
      legalName: issuerIdentification.legalName,
      grossIncomeRegistration: issuerIdentification.grossIncomeRegistration,
      activityStartDate: issuerIdentification.activityStartDate,
      version: issuerIdentification.version,
    })
    .from(issuerIdentification)
    .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
  if (!row) {
    throw new Error("issuer identification row missing: the seeding migration never ran");
  }
  return row;
}

export function registerIssuerIdentificationReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: IssuerIdentificationRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/fiscal-configuration/issuer-identification",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: permissionAccess("change_fiscal_configuration"), sessionSource },
    },
    async (_request, reply) => {
      const row = await findIssuerIdentification(options.db);
      await reply.code(200).send(toIssuerIdentificationWire(row, options.authorizedCuit));
    },
  );
}
