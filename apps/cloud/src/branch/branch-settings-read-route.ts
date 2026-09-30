import { type BranchSettingsBody, branchSettingsSchema } from "@purosur/contracts";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { sameOriginGuard } from "../access/backoffice-origin.js";
import {
  openSessionOf,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { branchHours, branchSettings } from "../platform/db/schema.js";

// Monday..Sunday order, matching how `day_of_week` numbers them in `branch_hours` (1 = Monday).
const BRANCH_SETTINGS_DAY_FIELDS = [
  "monday_hours",
  "tuesday_hours",
  "wednesday_hours",
  "thursday_hours",
  "friday_hours",
  "saturday_hours",
  "sunday_hours",
] as const;

type BranchSettingsDayField = (typeof BRANCH_SETTINGS_DAY_FIELDS)[number];

export interface BranchHoursRange {
  opensAt: string;
  closesAt: string;
}

export interface BranchSettingsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export interface BranchHoursRow {
  dayOfWeek: number;
  position: number;
  opensAt: string;
  closesAt: string;
}

export interface BranchSettingsRow {
  address: string;
  whatsappNumber: string;
  instagramHandle: string;
  hours: BranchHoursRow[];
  expiringLotAlertDays: number;
  unreviewedPriceAlertDays: number;
  goodConditionReturnDays: number;
  version: number;
}

type BranchHoursRangeWire = BranchSettingsBody[BranchSettingsDayField][number];

// Postgres' own `time` type answers with seconds ("09:00:00"); the wire only ever speaks the
// zero-padded HH:MM a caller sent, so this slices the trailing ":00" back off.
function normalizedTime(value: string): string {
  return value.slice(0, 5);
}

function dayHoursWireInPositionOrder(
  hours: BranchHoursRow[],
  dayOfWeek: number,
): BranchHoursRangeWire[] {
  return hours
    .filter((row) => row.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      opens_at: normalizedTime(row.opensAt),
      closes_at: normalizedTime(row.closesAt),
    }));
}

export function toBranchSettingsWire(row: BranchSettingsRow): BranchSettingsBody {
  const wire = {
    address: row.address,
    whatsapp_number: row.whatsappNumber,
    instagram_handle: row.instagramHandle,
    expiring_lot_alert_days: row.expiringLotAlertDays,
    unreviewed_price_alert_days: row.unreviewedPriceAlertDays,
    good_condition_return_days: row.goodConditionReturnDays,
    version: row.version,
  } as BranchSettingsBody;
  BRANCH_SETTINGS_DAY_FIELDS.forEach((field, index) => {
    wire[field] = dayHoursWireInPositionOrder(row.hours, index + 1);
  });
  return wire;
}

// Repeatable-read: both reads see one snapshot, so a save committing between them can't pair
// settings from before it with hours from after it.
export async function findBranchSettings<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<BranchSettingsRow> {
  return db.transaction((tx) => readBranchSettings(tx, locationId), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

export async function readBranchSettings<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<BranchSettingsRow> {
  const [row] = await db
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
    .where(eq(branchSettings.locationId, locationId));
  if (!row) {
    // Every location gets this row from the migration that creates the table, so a missing one
    // is a broken invariant, not a legitimate case.
    throw new Error(`branch settings missing for location ${locationId}`);
  }
  const hours = await db
    .select({
      dayOfWeek: branchHours.dayOfWeek,
      position: branchHours.position,
      opensAt: branchHours.opensAt,
      closesAt: branchHours.closesAt,
    })
    .from(branchHours)
    .where(eq(branchHours.locationId, locationId))
    .orderBy(asc(branchHours.dayOfWeek), asc(branchHours.position));
  return { ...row, hours };
}

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
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: permissionAccess("configure_branch"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const row = await findBranchSettings(options.db, openSession.locationId);
      await reply.code(200).send(branchSettingsSchema.parse(toBranchSettingsWire(row)));
    },
  );
}
