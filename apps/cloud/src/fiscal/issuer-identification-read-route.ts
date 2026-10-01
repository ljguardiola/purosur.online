import { type IssuerIdentificationBody, issuerIdentificationSchema } from "@purosur/contracts";
import type { AuthorizedIssuerIdentification } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { ISSUER_IDENTIFICATION_SINGLETON_ID, issuerIdentification } from "../platform/db/schema.js";

const ISSUER_IDENTIFICATION_TAX_STATUS = "Responsable Monotributo";

export interface IssuerIdentificationRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  // From deployment configuration (ARCA_CERTIFICATE); never accepted from a client.
  authorizedCuit: string;
  now?: () => Date;
}

interface IssuerIdentificationRow {
  legalName: string | null;
  grossIncomeRegistration: string | null;
  activityStartDate: string | null;
  version: number;
}

export function toIssuerIdentificationWire(
  identification: AuthorizedIssuerIdentification,
): IssuerIdentificationBody {
  return {
    legal_name: identification.legalName,
    gross_income_registration: identification.grossIncomeRegistration,
    activity_start_date: identification.activityStartDate,
    authorized_cuit: identification.authorizedCuit,
    tax_status: ISSUER_IDENTIFICATION_TAX_STATUS,
    version: identification.version,
  };
}

async function findIssuerIdentification<TQueryResult extends PgQueryResultHKT>(
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
    "/fiscal-settings/issuer-identification",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("change_fiscal_configuration"), sessionSource },
    },
    async (_request, reply) => {
      const row = await findIssuerIdentification(options.db);
      await reply
        .code(200)
        .send(
          issuerIdentificationSchema.parse(
            toIssuerIdentificationWire({ ...row, authorizedCuit: options.authorizedCuit }),
          ),
        );
    },
  );
}
