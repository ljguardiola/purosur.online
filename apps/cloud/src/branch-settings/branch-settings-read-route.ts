import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { branchSettings } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";

export interface BranchSettingsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so idle/absolute expiry are checked against a deterministic clock. */
  now?: () => Date;
}

export interface BranchSettingsRow {
  businessName: string;
  address: string;
  whatsappNumber: string;
  instagramHandle: string;
  weekdayHours: string;
  saturdayHours: string;
  sundayHours: string;
  timezone: string;
  expiringLotAlertDays: number;
  unreviewedPriceAlertDays: number;
  goodConditionReturnDays: number;
  defectiveReturnDays: number;
  version: number;
}

export interface BranchSettingsWire {
  business_name: string;
  address: string;
  whatsapp_number: string;
  instagram_handle: string;
  weekday_hours: string;
  saturday_hours: string;
  sunday_hours: string;
  timezone: string;
  expiring_lot_alert_days: number;
  unreviewed_price_alert_days: number;
  good_condition_return_days: number;
  defective_return_days: number;
  version: number;
}

export function toBranchSettingsWire(row: BranchSettingsRow): BranchSettingsWire {
  return {
    business_name: row.businessName,
    address: row.address,
    whatsapp_number: row.whatsappNumber,
    instagram_handle: row.instagramHandle,
    weekday_hours: row.weekdayHours,
    saturday_hours: row.saturdayHours,
    sunday_hours: row.sundayHours,
    timezone: row.timezone,
    expiring_lot_alert_days: row.expiringLotAlertDays,
    unreviewed_price_alert_days: row.unreviewedPriceAlertDays,
    good_condition_return_days: row.goodConditionReturnDays,
    defective_return_days: row.defectiveReturnDays,
    version: row.version,
  };
}

/**
 * Reads `locationId`'s branch settings, for `GET /branch-settings` and for the edit route
 * `branch-settings-edit-route.ts` will add. Every location gets its row from the migration that
 * creates this table, so a missing row here means that invariant broke, not a legitimate "not
 * found" a caller should ever see.
 */
export async function findBranchSettings<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<BranchSettingsRow> {
  const [row] = await db
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
    .where(eq(branchSettings.locationId, locationId));
  if (!row) {
    throw new Error(`branch settings missing for location ${locationId}`);
  }
  return row;
}

/**
 * Registers `GET /branch-settings`: gated by `configure_branch` (an Administrator always holds it
 * implicitly), and scoped to the requesting session's own location the same way
 * `branch-users.ts`'s reads are, so it always answers with that branch's own settings and never
 * another one's.
 */
export function registerBranchSettingsReadRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: BranchSettingsRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/branch-settings",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: permissionAccess("configure_branch"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const row = await findBranchSettings(options.db, openSession.locationId);
      await reply.code(200).send(toBranchSettingsWire(row));
    },
  );
}
