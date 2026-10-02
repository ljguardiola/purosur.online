import { issuerIdentificationEditBodySchema, issuerIdentificationSchema } from "@purosur/contracts";
import { editIssuerIdentification } from "@purosur/domain/fiscal/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import { requirePasskeyAuthorization } from "../access/passkey-authorization-guard.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleIssuerIdentificationStore } from "./drizzle-issuer-identification-store.js";
import {
  type IssuerIdentificationRouteOptions,
  toIssuerIdentificationWire,
} from "./issuer-identification-read-route.js";

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "the issuer identification was changed since it was loaded",
} as const;

export function registerIssuerIdentificationEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: IssuerIdentificationRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const ports = { store: new DrizzleIssuerIdentificationStore(options.db) };
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/fiscal-settings/issuer-identification",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const parsedBody = await readValidatedBody(
        reply,
        issuerIdentificationEditBodySchema(attemptedAt),
        request.body,
      );
      if (!parsedBody) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await editIssuerIdentification(ports, {
        legalName: parsedBody.legal_name,
        grossIncomeRegistration: parsedBody.gross_income_registration,
        activityStartDate: parsedBody.activity_start_date,
        authorizedCuit: options.authorizedCuit,
        version: parsedBody.version,
        actorId: openSession.userId,
      });

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }

      await reply
        .code(200)
        .send(issuerIdentificationSchema.parse(toIssuerIdentificationWire(outcome.identification)));
    },
  );
}
