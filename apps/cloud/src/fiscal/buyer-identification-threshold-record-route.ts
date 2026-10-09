import {
  buyerIdentificationThresholdRecordBodySchema,
  buyerIdentificationThresholdSchema,
} from "@purosur/contracts";
import { recordBuyerIdentificationThreshold } from "@purosur/domain/fiscal/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import { requirePasskeyAuthorization } from "../sessions/passkey-authorization-guard.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import type { BuyerIdentificationThresholdsRouteOptions } from "./buyer-identification-thresholds-list-route.js";
import { DrizzleBuyerIdentificationThresholdStore } from "./drizzle-buyer-identification-threshold-store.js";

export function registerBuyerIdentificationThresholdRecordRoute<
  TQueryResult extends PgQueryResultHKT,
>(app: FastifyInstance, options: BuyerIdentificationThresholdsRouteOptions<TQueryResult>): void {
  const { now } = options;
  const ports = { store: new DrizzleBuyerIdentificationThresholdStore(options.db, now) };
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.post(
    "/buyer-identification-thresholds",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("cash_area"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const body = await readValidatedBody(
        reply,
        buyerIdentificationThresholdRecordBodySchema,
        request.body,
      );
      if (!body) {
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await recordBuyerIdentificationThreshold(ports, {
        amount: body.amount,
        validFrom: body.valid_from,
        actorId: openSession.userId,
      });

      if (outcome.kind === "not_after_latest") {
        await reply.code(409).send({
          code: "threshold_not_after_latest",
          message: `a threshold must start after the latest one, which starts on ${outcome.latestValidFrom}`,
          details: [{ field: "valid_from" }],
        });
        return;
      }

      await reply.code(201).send(
        buyerIdentificationThresholdSchema.parse({
          id: outcome.threshold.id,
          amount: outcome.threshold.amount,
          valid_from: outcome.threshold.validFrom,
        }),
      );
    },
  );
}
