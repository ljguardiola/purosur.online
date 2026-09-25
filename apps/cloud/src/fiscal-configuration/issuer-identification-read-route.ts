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
  /**
   * The CUIT the business is authorized under at the tax authority: deployment configuration
   * (`AUTHORIZED_CUIT`, resolved in `server.ts`), never stored in the database and never accepted
   * from a client.
   */
  authorizedCuit: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
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

/**
 * Reads the business's one issuer identification row for `GET /fiscal-configuration/issuer-
 * identification`. The migration that creates `issuer_identification` seeds its single row, so a
 * missing row here means that invariant broke, not a legitimate "not found" a caller should ever
 * see, the same reasoning `branch-settings-read-route.ts` gives its own seeded row.
 */
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

/**
 * Registers `GET /fiscal-configuration/issuer-identification`: gated by
 * `change_fiscal_configuration` (an Administrator always holds it implicitly). The authorized CUIT
 * and the tax status are never read from the database: they come from `options.authorizedCuit`
 * (deployment configuration) and the fixed `ISSUER_IDENTIFICATION_TAX_STATUS`, so nothing a client
 * sends can ever change either.
 */
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
