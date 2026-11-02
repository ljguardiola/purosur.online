import { revokedInstallationConfirmationBodySchema } from "@purosur/contracts";
import type { ZoneRulesSource } from "@purosur/domain";
import { confirmRevokedInstallationUnsynced } from "@purosur/domain/fiscal/use-cases";
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
import { DrizzleConfirmRevokedInstallationStore } from "./drizzle-confirm-revoked-installation-store.js";

export interface RevokedInstallationConfirmationRouteOptions<
  TQueryResult extends PgQueryResultHKT,
> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
  zoneRules: ZoneRulesSource;
}

const NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "the branch has no such installation among those that report that fortnight",
} as const;

const ALREADY_CONFIRMED_RESPONSE = {
  code: "already_confirmed",
  message: "that installation is already confirmed for that fortnight",
} as const;

const ALREADY_PRESENTED_RESPONSE = {
  code: "already_presented",
  message: "the report of that fortnight was already presented",
} as const;

const NOT_REVOKED_RESPONSE = {
  code: "not_revoked",
  message: "that installation was not revoked",
} as const;

const NOT_HOLDING_BACK_RESPONSE = {
  code: "not_holding_back",
  message: "that installation is not holding that fortnight's report back",
} as const;

const HOLDS_UNAPPLIED_EVENTS_RESPONSE = {
  code: "holds_unapplied_events",
  message: "that installation still holds received events not yet applied",
} as const;

export function registerRevokedInstallationConfirmationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RevokedInstallationConfirmationRouteOptions<TQueryResult>,
): void {
  const { now, zoneRules } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const store = new DrizzleConfirmRevokedInstallationStore(options.db);

  app.post(
    "/registers/fortnight-presentations/revoked-installation-confirmations",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);
      const body = await readValidatedBody(
        reply,
        revokedInstallationConfirmationBodySchema,
        request.body,
      );
      if (!body) {
        return;
      }
      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await confirmRevokedInstallationUnsynced(
        { store, clock: { now }, zoneRules },
        {
          locationId: openSession.locationId,
          pointOfSaleNumber: body.point_of_sale_number,
          fortnightStart: body.fortnight_start,
          installationId: body.installation_id,
          actorId: openSession.userId,
        },
      );

      switch (outcome.kind) {
        case "not_found":
          await reply.code(404).send(NOT_FOUND_RESPONSE);
          return;
        case "already_confirmed":
          await reply.code(409).send(ALREADY_CONFIRMED_RESPONSE);
          return;
        case "already_presented":
          await reply.code(409).send(ALREADY_PRESENTED_RESPONSE);
          return;
        case "not_revoked":
          await reply.code(409).send(NOT_REVOKED_RESPONSE);
          return;
        case "not_holding_back":
          await reply.code(409).send(NOT_HOLDING_BACK_RESPONSE);
          return;
        case "holds_unapplied_events":
          await reply.code(409).send(HOLDS_UNAPPLIED_EVENTS_RESPONSE);
          return;
        case "confirmed":
          await reply.code(204).send();
          return;
      }
    },
  );
}
