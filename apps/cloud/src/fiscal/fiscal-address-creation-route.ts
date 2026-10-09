import { fiscalAddressCreationBodySchema, fiscalAddressSchema } from "@purosur/contracts";
import { createFiscalAddress } from "@purosur/domain/fiscal/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
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
import { DrizzleFiscalAddressStore } from "./drizzle-fiscal-address-store.js";
import {
  type FiscalAddressesRouteOptions,
  toFiscalAddressWire,
} from "./fiscal-addresses-list-route.js";

export const FISCAL_ADDRESS_NAME_TAKEN_RESPONSE = {
  code: "fiscal_address_name_taken",
  message: "a fiscal address with that name already exists",
  details: [{ field: "name" }],
} as const;

export function registerFiscalAddressCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: FiscalAddressesRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  const ports = { store: new DrizzleFiscalAddressStore(options.db, now) };
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/fiscal-addresses",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const body = await readValidatedBody(reply, fiscalAddressCreationBodySchema, request.body);
      if (!body) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await createFiscalAddress(ports, {
        name: body.name,
        streetAddress: body.street_address,
        actorId: openSession.userId,
      });

      if (outcome.kind === "name_taken") {
        await reply.code(409).send(FISCAL_ADDRESS_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply
        .code(201)
        .send(fiscalAddressSchema.parse(toFiscalAddressWire(outcome.fiscalAddress)));
    },
  );
}
