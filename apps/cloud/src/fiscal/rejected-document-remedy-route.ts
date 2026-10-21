import {
  type RejectedDocumentRemedyBody,
  rejectedDocumentRemedyBodySchema,
  rejectedDocumentRemedyResponseSchema,
} from "@purosur/contracts";
import type {
  DocumentFieldChange,
  OfflineDocumentCorrectionRefusal,
  RejectedDocumentRemedy,
} from "@purosur/domain";
import { remedyRejectedDocument } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { requirePasskeyAuthorization } from "../credentials/passkey-authorization-guard.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleRejectedDocumentRemedyStore } from "./drizzle-rejected-document-remedy-store.js";

export interface RejectedDocumentRemedyRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
}

const NOT_REJECTED_RESPONSE = {
  code: "not_rejected",
  message: "the tax authority has not rejected that document of the presentation",
} as const;

const ALREADY_REMEDIED_RESPONSE = {
  code: "already_remedied",
  message: "that rejected document already has a remedy waiting to be presented",
} as const;

const DOCUMENT_NOT_FOUND_RESPONSE = {
  code: "document_not_found",
  message: "the presentation has no document with that number",
} as const;

const SNAKE_FIELD: Record<DocumentFieldChange["field"], string> = {
  issuedOn: "issued_on",
  total: "total",
  buyerDocumentType: "buyer_document_type",
  buyerDocumentNumber: "buyer_document_number",
  buyerTaxStatusCode: "buyer_tax_status_code",
};

function remedyOf(wire: RejectedDocumentRemedyBody["remedy"]): RejectedDocumentRemedy {
  if (wire.kind === "report") {
    return { kind: "report" };
  }
  const { issued_on, total, buyer_document_type, buyer_document_number, buyer_tax_status_code } =
    wire.correction;
  return {
    kind: "printed",
    correction: {
      ...(issued_on === undefined ? {} : { issuedOn: issued_on }),
      ...(total === undefined ? {} : { total }),
      ...(buyer_document_type === undefined ? {} : { buyerDocumentType: buyer_document_type }),
      ...(buyer_document_number === undefined
        ? {}
        : { buyerDocumentNumber: buyer_document_number }),
      ...(buyer_tax_status_code === undefined ? {} : { buyerTaxStatusCode: buyer_tax_status_code }),
    },
  };
}

function correctionRefusedResponse(refusal: OfflineDocumentCorrectionRefusal) {
  return {
    code: "correction_refused",
    message: "the correction cannot be recorded for that document",
    refusal,
  };
}

export function registerRejectedDocumentRemedyRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RejectedDocumentRemedyRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleRejectedDocumentRemedyStore(options.db);

  app.post(
    "/registers/fortnight-presentations/rejected-document-remedies",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);
      const body = await readValidatedBody(reply, rejectedDocumentRemedyBodySchema, request.body);
      if (!body) {
        return;
      }
      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await remedyRejectedDocument(
        { store, clock: { now } },
        {
          locationId: openSession.locationId,
          pointOfSaleNumber: body.point_of_sale_number,
          fortnightStart: body.fortnight_start,
          documentType: body.document_type,
          number: body.number,
          remedy: remedyOf(body.remedy),
          actorId: openSession.userId,
        },
      );

      switch (outcome.kind) {
        case "not_rejected":
          await reply.code(409).send(NOT_REJECTED_RESPONSE);
          return;
        case "already_remedied":
          await reply.code(409).send(ALREADY_REMEDIED_RESPONSE);
          return;
        case "document_not_found":
          await reply.code(404).send(DOCUMENT_NOT_FOUND_RESPONSE);
          return;
        case "correction_refused":
          await reply.code(422).send(correctionRefusedResponse(outcome.refusal));
          return;
        case "remedied":
          await reply.code(200).send(
            rejectedDocumentRemedyResponseSchema.parse({
              recorded_at: outcome.recordedAt.toISOString(),
              changes: outcome.changes.map(({ field, before, after }) => ({
                field: SNAKE_FIELD[field],
                before,
                after,
              })),
            }),
          );
          return;
      }
    },
  );
}
