import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { auditLog, branchSettings } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import type {
  BranchSettingsRouteOptions,
  BranchSettingsRow,
} from "./branch-settings-read-route.js";
import { toBranchSettingsWire } from "./branch-settings-read-route.js";
import {
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

/**
 * Updates one branch's settings row in one transaction, rejecting a save made over a version
 * someone else already changed the same way `editRole` (`role-edit-route.ts`) rejects a stale
 * role save. Leaving every field exactly as it was is a no-op: the version does not bump and
 * nothing is audited.
 */
export async function editBranchSettings<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EditBranchSettingsInput,
): Promise<EditBranchSettingsOutcome> {
  return db.transaction<EditBranchSettingsOutcome>(async (tx) => {
    // Locks this one row so a concurrent save against the same branch waits instead of racing:
    // the version check below and the write it may lead to happen against a value that cannot
    // change out from under this transaction while it holds the lock.
    const [current] = await tx
      .select({
        businessName: branchSettings.businessName,
        address: branchSettings.address,
        whatsappNumber: branchSettings.whatsappNumber,
        instagramHandle: branchSettings.instagramHandle,
        weekdayHours: branchSettings.weekdayHours,
        saturdayHours: branchSettings.saturdayHours,
        sundayHours: branchSettings.sundayHours,
        timezone: branchSettings.timezone,
        expiringLotAlertDays: branchSettings.expiringLotAlertDays,
        unreviewedPriceAlertDays: branchSettings.unreviewedPriceAlertDays,
        goodConditionReturnDays: branchSettings.goodConditionReturnDays,
        defectiveReturnDays: branchSettings.defectiveReturnDays,
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

    const next: Omit<BranchSettingsRow, "version"> = {
      businessName: input.businessName,
      address: input.address,
      whatsappNumber: input.whatsappNumber,
      instagramHandle: input.instagramHandle,
      weekdayHours: input.weekdayHours,
      saturdayHours: input.saturdayHours,
      sundayHours: input.sundayHours,
      timezone: input.timezone,
      expiringLotAlertDays: input.expiringLotAlertDays,
      unreviewedPriceAlertDays: input.unreviewedPriceAlertDays,
      goodConditionReturnDays: input.goodConditionReturnDays,
      defectiveReturnDays: input.defectiveReturnDays,
    };
    const unchanged =
      current.businessName === next.businessName &&
      current.address === next.address &&
      current.whatsappNumber === next.whatsappNumber &&
      current.instagramHandle === next.instagramHandle &&
      current.weekdayHours === next.weekdayHours &&
      current.saturdayHours === next.saturdayHours &&
      current.sundayHours === next.sundayHours &&
      current.timezone === next.timezone &&
      current.expiringLotAlertDays === next.expiringLotAlertDays &&
      current.unreviewedPriceAlertDays === next.unreviewedPriceAlertDays &&
      current.goodConditionReturnDays === next.goodConditionReturnDays &&
      current.defectiveReturnDays === next.defectiveReturnDays;

    if (unchanged) {
      return { kind: "applied", row: { ...current } };
    }

    const nextVersion = current.version + 1;
    await tx
      .update(branchSettings)
      .set({ ...next, version: nextVersion })
      .where(eq(branchSettings.locationId, input.locationId));

    await tx.insert(auditLog).values({
      entity: "branch_settings",
      entityId: input.locationId,
      actorId: input.actorId,
      previousValue: toBranchSettingsWire(current),
      newValue: toBranchSettingsWire({ ...next, version: nextVersion }),
    });

    return { kind: "applied", row: { ...next, version: nextVersion } };
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
