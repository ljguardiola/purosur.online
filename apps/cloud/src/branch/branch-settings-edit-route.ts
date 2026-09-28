import { type BranchSettingsEditBody, branchSettingsEditBodySchema } from "@purosur/contracts";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { checkRequestIsSameOrigin } from "../access/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { auditLog, branchHours, branchSettings } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import type {
  BranchHoursRange,
  BranchHoursRow,
  BranchSettingsRouteOptions,
  BranchSettingsRow,
} from "./branch-settings-read-route.js";
import { toBranchSettingsWire } from "./branch-settings-read-route.js";

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "these settings were changed since they were loaded",
} as const;

interface BranchSettingsEditInput {
  address: string;
  whatsappNumber: string;
  instagramHandle: string;
  mondayHours: BranchHoursRange[];
  tuesdayHours: BranchHoursRange[];
  wednesdayHours: BranchHoursRange[];
  thursdayHours: BranchHoursRange[];
  fridayHours: BranchHoursRange[];
  saturdayHours: BranchHoursRange[];
  sundayHours: BranchHoursRange[];
  expiringLotAlertDays: number;
  unreviewedPriceAlertDays: number;
  goodConditionReturnDays: number;
  version: number;
}

function rangesFromBody(ranges: BranchSettingsEditBody["monday_hours"]): BranchHoursRange[] {
  return ranges.map((range) => ({ opensAt: range.opens_at, closesAt: range.closes_at }));
}

function editInputFromBody(body: BranchSettingsEditBody): BranchSettingsEditInput {
  return {
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
  };
}

export interface EditBranchSettingsInput extends BranchSettingsEditInput {
  locationId: string;
  actorId: string;
}

export type EditBranchSettingsOutcome =
  | { kind: "stale_version" }
  | { kind: "applied"; row: BranchSettingsRow };

function orderedDayHours(input: BranchSettingsEditInput): BranchHoursRange[][] {
  return [
    input.mondayHours,
    input.tuesdayHours,
    input.wednesdayHours,
    input.thursdayHours,
    input.fridayHours,
    input.saturdayHours,
    input.sundayHours,
  ];
}

function currentOrderedDayHours(hours: BranchHoursRow[]): BranchHoursRange[][] {
  const byDay: BranchHoursRange[][] = Array.from({ length: 7 }, () => []);
  for (const row of hours) {
    byDay[row.dayOfWeek - 1]?.push({
      opensAt: row.opensAt.slice(0, 5),
      closesAt: row.closesAt.slice(0, 5),
    });
  }
  return byDay;
}

function rangesEqual(a: BranchHoursRange[], b: BranchHoursRange[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (range, index) =>
        range.opensAt === b[index]?.opensAt && range.closesAt === b[index]?.closesAt,
    )
  );
}

function hoursUnchangedInOrder(current: BranchHoursRow[], input: BranchSettingsEditInput): boolean {
  const currentDays = currentOrderedDayHours(current);
  const nextDays = orderedDayHours(input);
  return currentDays.every((ranges, day) => rangesEqual(ranges, nextDays[day] ?? []));
}

function nextHoursRows(input: BranchSettingsEditInput): BranchHoursRow[] {
  return orderedDayHours(input).flatMap((ranges, dayIndex) =>
    ranges.map((range, position) => ({
      dayOfWeek: dayIndex + 1,
      position,
      opensAt: range.opensAt,
      closesAt: range.closesAt,
    })),
  );
}

export async function editBranchSettings<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EditBranchSettingsInput,
): Promise<EditBranchSettingsOutcome> {
  return db.transaction<EditBranchSettingsOutcome>(async (tx) => {
    // `for("update")` row-locks this branch so a concurrent save waits instead of racing the
    // version check, hours read and write below.
    const [current] = await tx
      .select({
        address: branchSettings.address,
        whatsappNumber: branchSettings.whatsappNumber,
        instagramHandle: branchSettings.instagramHandle,
        expiringLotAlertDays: branchSettings.expiringLotAlertDays,
        unreviewedPriceAlertDays: branchSettings.unreviewedPriceAlertDays,
        goodConditionReturnDays: branchSettings.goodConditionReturnDays,
        version: branchSettings.version,
      })
      .from(branchSettings)
      .where(eq(branchSettings.locationId, input.locationId))
      .for("update");
    if (!current) {
      throw new Error(`branch settings missing for location ${input.locationId}`);
    }
    if (current.version !== input.version) {
      return { kind: "stale_version" };
    }

    const currentHours = await tx
      .select({
        dayOfWeek: branchHours.dayOfWeek,
        position: branchHours.position,
        opensAt: branchHours.opensAt,
        closesAt: branchHours.closesAt,
      })
      .from(branchHours)
      .where(eq(branchHours.locationId, input.locationId))
      .orderBy(asc(branchHours.dayOfWeek), asc(branchHours.position));

    const next: Omit<BranchSettingsRow, "version" | "hours"> = {
      address: input.address,
      whatsappNumber: input.whatsappNumber,
      instagramHandle: input.instagramHandle,
      expiringLotAlertDays: input.expiringLotAlertDays,
      unreviewedPriceAlertDays: input.unreviewedPriceAlertDays,
      goodConditionReturnDays: input.goodConditionReturnDays,
    };
    const unchanged =
      current.address === next.address &&
      current.whatsappNumber === next.whatsappNumber &&
      current.instagramHandle === next.instagramHandle &&
      current.expiringLotAlertDays === next.expiringLotAlertDays &&
      current.unreviewedPriceAlertDays === next.unreviewedPriceAlertDays &&
      current.goodConditionReturnDays === next.goodConditionReturnDays &&
      hoursUnchangedInOrder(currentHours, input);

    if (unchanged) {
      return { kind: "applied", row: { ...current, hours: currentHours } };
    }

    const nextVersion = current.version + 1;
    await tx
      .update(branchSettings)
      .set({ ...next, version: nextVersion })
      .where(eq(branchSettings.locationId, input.locationId));

    await tx.delete(branchHours).where(eq(branchHours.locationId, input.locationId));
    const nextHours = nextHoursRows(input);
    if (nextHours.length > 0) {
      await tx
        .insert(branchHours)
        .values(nextHours.map((row) => ({ ...row, locationId: input.locationId })));
    }

    await tx.insert(auditLog).values({
      entity: "branch_settings",
      entityId: input.locationId,
      actorId: input.actorId,
      previousValue: toBranchSettingsWire({ ...current, hours: currentHours }),
      newValue: toBranchSettingsWire({ ...next, version: nextVersion, hours: nextHours }),
    });

    return { kind: "applied", row: { ...next, version: nextVersion, hours: nextHours } };
  });
}

export function registerBranchSettingsEditRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BranchSettingsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.put(
    "/branch-settings",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: permissionAccess("configure_branch"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const parsedBody = await readValidatedBody(reply, branchSettingsEditBodySchema, request.body);
      if (!parsedBody) {
        return;
      }

      const outcome = await editBranchSettings(options.db, {
        ...editInputFromBody(parsedBody),
        locationId: openSession.locationId,
        actorId: openSession.userId,
      });

      if (outcome.kind === "stale_version") {
        await reply.code(409).send(STALE_VERSION_RESPONSE);
        return;
      }

      await reply.code(200).send(toBranchSettingsWire(outcome.row));
    },
  );
}
