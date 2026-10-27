import { issuedFiscalDocumentsQuerySchema, issuedFiscalDocumentsSchema } from "@purosur/contracts";
import {
  type IssuedFiscalDocument,
  type IssuedFiscalDocumentVoucher,
  readIssuedFiscalDocuments,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleIssuedFiscalDocumentsReader } from "./drizzle-issued-fiscal-documents-reader.js";

export interface IssuedFiscalDocumentsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

const voucherOnTheWire = ({ voucherType, pointOfSale, number }: IssuedFiscalDocumentVoucher) => ({
  voucher_type: voucherType,
  point_of_sale: pointOfSale,
  number,
});

export function registerIssuedFiscalDocumentsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: IssuedFiscalDocumentsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleIssuedFiscalDocumentsReader(options.db);

  app.get(
    "/fiscal/documents",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("fiscal_information"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(reply, issuedFiscalDocumentsQuerySchema, request.query);
      if (!query) {
        return;
      }
      const listing = await readIssuedFiscalDocuments(
        { reader, clock: { now } },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
          registerId: query.register_id,
          kind: query.kind,
          number: query.number,
          page: query.page ?? 1,
        },
      );
      await reply.code(200).send(
        issuedFiscalDocumentsSchema.parse({
          range: listing.range,
          documents: listing.documents.map((document) => ({
            kind: document.kind,
            ...voucherOnTheWire(document),
            issued_on: document.issuedOn,
            issued_at: document.issuedAt.toISOString(),
            register: document.register,
            authorization: authorizationOnTheWire(document.authorization),
            state: document.state,
            contingency: document.contingency,
            total: document.total,
            corrected_voucher:
              document.correctedVoucher === null
                ? null
                : voucherOnTheWire(document.correctedVoucher),
          })),
          total: listing.total,
          page_size: listing.pageSize,
        }),
      );
    },
  );
}

function authorizationOnTheWire(authorization: IssuedFiscalDocument["authorization"]) {
  if (authorization === null) {
    return null;
  }
  return authorization.kind === "cae"
    ? { kind: authorization.kind, code: authorization.code, due_on: authorization.dueOn }
    : {
        kind: authorization.kind,
        code: authorization.code,
        fortnight_start: authorization.fortnightStart,
        fortnight_end: authorization.fortnightEnd,
      };
}
