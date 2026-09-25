import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { auditLog, branchHours, branchSettings } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import type {
  BranchHoursRow,
  BranchSettingsRouteOptions,
  BranchSettingsRow,
} from "./branch-settings-read-route.js";
import { toBranchSettingsWire } from "./branch-settings-read-route.js";
import {
  type BranchHoursRange,
  type BranchSettingsEditInput,
  type BranchSettingsFieldValidationFailure,
  readBranchSettingsEditBody,
} from "./branch-settings-validation.js";

const STALE_VERSION_RESPONSE = {
  code: "stale_version",
  message: "these settings were changed since they were loaded",
} as const;

function isValidationFailure(
  value: BranchSettingsEditInput | BranchSettingsFieldValidationFailure,
): value is BranchSettingsFieldValidationFailure {
  return "field" in value;
}

export interface EditBranchSettingsInput extends BranchSettingsEditInput {
  locationId: string;
  actorId: string;
}

export type EditBranchSettingsOutcome =
  | { kind: "stale_version" }
  | { kind: "applied"; row: BranchSettingsRow };

/** The submitted day fields, in Monday..Sunday order, matching `day_of_week` (1 = Monday). */
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

/** The currently stored hours, grouped by day (index 0 = Monday) in position order. */
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

/**
 * Compares the currently stored hours against the submitted ones, day by day and in order: a
 * day's ranges reordered without changing their times still counts as a change, since the server
 * never reorders them either way.
 */
function hoursUnchanged(current: BranchHoursRow[], input: BranchSettingsEditInput): boolean {
  const currentDays = currentOrderedDayHours(current);
  const nextDays = orderedDayHours(input);
  return currentDays.every((ranges, day) => rangesEqual(ranges, nextDays[day] ?? []));
}

/** The full replacement row set for `branch_hours`, in Monday..Sunday, position order. */
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

/**
 * Updates one branch's settings row and its hours in one transaction, rejecting a save made over a
 * version someone else already changed the same way `editRole` (`role-edit-route.ts`) rejects a
 * stale role save. Leaving every field and every day's hours exactly as they were is a no-op: the
 * version does not bump and nothing is audited.
 */
export async function editBranchSettings<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EditBranchSettingsInput,
): Promise<EditBranchSettingsOutcome> {
  return db.transaction<EditBranchSettingsOutcome>(async (tx) => {
    // Locks this one row so a concurrent save against the same branch waits instead of racing:
    // the version check below, the hours read that follows, and the write they may lead to all
    // happen against a value that cannot change out from under this transaction while it holds
    // the lock.
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
      // Every location gets its row from the migration that creates this table
      // (`branch-settings-read-route.ts` gives the same reasoning); an open session's own location
      // missing one would mean that invariant broke, not a legitimate case this route should see.
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
      hoursUnchanged(currentHours, input);

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

/**
 * Registers `PUT /branch-settings`: gated by `configure_branch` (an Administrator always holds it
 * implicitly) the same way `GET /branch-settings` is, and scoped to the requesting session's own
 * location so a save always lands on that branch's own row and never another one's. Unlike
 * `editRole`, this is not a sensitive action (see the feature document's decisions), so it carries
 * no passkey reauthentication step-up.
 */
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

      const parsedBody = readBranchSettingsEditBody(request.body);
      if (isValidationFailure(parsedBody)) {
        await reply.code(400).send({
          code: "validation_failed",
          message: parsedBody.message,
          details: [{ field: parsedBody.field }],
        });
        return;
      }

      const outcome = await editBranchSettings(options.db, {
        ...parsedBody,
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
