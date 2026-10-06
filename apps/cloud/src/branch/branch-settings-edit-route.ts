import {
  type BranchSettingsEditBody,
  branchSettingsEditBodySchema,
  branchSettingsSchema,
} from "@purosur/contracts";
import { type BranchHoursRange, editBranchSettings } from "@purosur/domain/branch/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import type { BranchSettingsRouteOptions } from "./branch-settings-read-route.js";
import { toBranchSettingsWire } from "./branch-settings-wire.js";
import { DrizzleBranchSettingsStore } from "./drizzle-branch-settings-store.js";

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "these settings were changed since they were loaded",
} as const;

function rangesFromBody(ranges: BranchSettingsEditBody["monday_hours"]): BranchHoursRange[] {
  return ranges.map((range) => ({ opensAt: range.opens_at, closesAt: range.closes_at }));
}

export function registerBranchSettingsEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BranchSettingsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  const ports = { store: new DrizzleBranchSettingsStore(options.db, now) };
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/locations/current/settings",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("branch_area"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const body = await readValidatedBody(reply, branchSettingsEditBodySchema, request.body);
      if (!body) {
        return;
      }

      const outcome = await editBranchSettings(ports, {
        locationId: openSession.locationId,
        actorId: openSession.userId,
        address: body.address,
        whatsappNumber: body.whatsapp_number,
        instagramHandle: body.instagram_handle,
        mondayHours: rangesFromBody(body.monday_hours),
        tuesdayHours: rangesFromBody(body.tuesday_hours),
        wednesdayHours: rangesFromBody(body.wednesday_hours),
        thursdayHours: rangesFromBody(body.thursday_hours),
        fridayHours: rangesFromBody(body.friday_hours),
        saturdayHours: rangesFromBody(body.saturday_hours),
        sundayHours: rangesFromBody(body.sunday_hours),
        expiringLotAlertDays: body.expiring_lot_alert_days,
        unreviewedPriceAlertDays: body.unreviewed_price_alert_days,
        goodConditionReturnDays: body.good_condition_return_days,
        version: body.version,
      });

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }

      await reply
        .code(200)
        .send(branchSettingsSchema.parse(toBranchSettingsWire(outcome.settings)));
    },
  );
}
