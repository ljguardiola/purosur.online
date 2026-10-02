import { fiscalAddressEditBodySchema, fiscalAddressSchema } from "@purosur/contracts";
import { editFiscalAddress } from "@purosur/domain/fiscal/use-cases";
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
import { readRecordIds } from "../platform/record-id-params.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { DrizzleFiscalAddressStore } from "./drizzle-fiscal-address-store.js";
import { FISCAL_ADDRESS_NAME_TAKEN_RESPONSE } from "./fiscal-address-creation-route.js";
import {
  type FiscalAddressesRouteOptions,
  toFiscalAddressWire,
} from "./fiscal-addresses-list-route.js";

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no fiscal address with that id",
} as const;

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "this fiscal address was changed since it was loaded",
} as const;

export function registerFiscalAddressEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: FiscalAddressesRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const ports = { store: new DrizzleFiscalAddressStore(options.db) };
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/fiscal-addresses/:id",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const ids = await readRecordIds(reply, request.params, ["id"]);
      if (!ids) {
        return;
      }
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const body = await readValidatedBody(reply, fiscalAddressEditBodySchema, request.body);
      if (!body) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await editFiscalAddress(ports, {
        fiscalAddressId: ids.id,
        name: body.name,
        streetAddress: body.street_address,
        version: body.version,
        actorId: openSession.userId,
      });

      if (outcome.kind === "not_found") {
        await reply.code(404).send(NOT_FOUND_RESPONSE);
        return;
      }
      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }
      if (outcome.kind === "name_taken") {
        await reply.code(409).send(FISCAL_ADDRESS_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply
        .code(200)
        .send(fiscalAddressSchema.parse(toFiscalAddressWire(outcome.fiscalAddress)));
    },
  );
}
