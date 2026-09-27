import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  type BranchSettingsWire,
  toBranchSettingsWire,
} from "../branch/branch-settings-read-route.js";
import type { BranchHoursRange } from "../branch/branch-settings-validation.js";
import { branchHours, branchSettings } from "../platform/db/schema.js";
import { SAMPLE_BRANCH_SETTINGS } from "./sample-catalog.js";

export const BRANCH_SETTINGS_DEFAULTS = {
  address: "",
  whatsappNumber: "",
  instagramHandle: "",
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 30,
  goodConditionReturnDays: 15,
};

type BranchSettingsFields = typeof BRANCH_SETTINGS_DEFAULTS;

const SAMPLE_HOURS_BY_DAY: readonly BranchHoursRange[][] = [
  SAMPLE_BRANCH_SETTINGS.mondayHours,
  SAMPLE_BRANCH_SETTINGS.tuesdayHours,
  SAMPLE_BRANCH_SETTINGS.wednesdayHours,
  SAMPLE_BRANCH_SETTINGS.thursdayHours,
  SAMPLE_BRANCH_SETTINGS.fridayHours,
  SAMPLE_BRANCH_SETTINGS.saturdayHours,
  SAMPLE_BRANCH_SETTINGS.sundayHours,
];

interface BranchSettingsState {
  fields: BranchSettingsFields;
  hoursByDay: BranchHoursRange[][];
}

async function readBranchSettingsState<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<BranchSettingsState> {
  const [fields] = await db
    .select({
      address: branchSettings.address,
      whatsappNumber: branchSettings.whatsappNumber,
      instagramHandle: branchSettings.instagramHandle,
      expiringLotAlertDays: branchSettings.expiringLotAlertDays,
      unreviewedPriceAlertDays: branchSettings.unreviewedPriceAlertDays,
      goodConditionReturnDays: branchSettings.goodConditionReturnDays,
    })
    .from(branchSettings)
    .where(eq(branchSettings.locationId, locationId));
  if (!fields) {
    throw new Error("sample-data: no branch settings are seeded for the location");
  }
  const hoursRows = await db
    .select({
      dayOfWeek: branchHours.dayOfWeek,
      opensAt: branchHours.opensAt,
      closesAt: branchHours.closesAt,
    })
    .from(branchHours)
    .where(eq(branchHours.locationId, locationId))
    .orderBy(asc(branchHours.dayOfWeek), asc(branchHours.position));
  const hoursByDay: BranchHoursRange[][] = Array.from({ length: 7 }, () => []);
  for (const row of hoursRows) {
    hoursByDay[row.dayOfWeek - 1]?.push({
      opensAt: row.opensAt.slice(0, 5),
      closesAt: row.closesAt.slice(0, 5),
    });
  }
  return { fields, hoursByDay };
}

function fieldsEqual(a: BranchSettingsFields, b: BranchSettingsFields): boolean {
  return (
    a.address === b.address &&
    a.whatsappNumber === b.whatsappNumber &&
    a.instagramHandle === b.instagramHandle &&
    a.expiringLotAlertDays === b.expiringLotAlertDays &&
    a.unreviewedPriceAlertDays === b.unreviewedPriceAlertDays &&
    a.goodConditionReturnDays === b.goodConditionReturnDays
  );
}

function hoursEqual(a: readonly BranchHoursRange[][], b: readonly BranchHoursRange[][]): boolean {
  return a.every((ranges, day) => {
    const other = b[day] ?? [];
    return (
      ranges.length === other.length &&
      ranges.every(
        (range, index) =>
          range.opensAt === other[index]?.opensAt && range.closesAt === other[index]?.closesAt,
      )
    );
  });
}

export async function branchSettingsAreAtDefaults<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<boolean> {
  const state = await readBranchSettingsState(db, locationId);
  return (
    fieldsEqual(state.fields, BRANCH_SETTINGS_DEFAULTS) &&
    state.hoursByDay.every((ranges) => ranges.length === 0)
  );
}

export async function branchSettingsEqualSampleValues<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
): Promise<boolean> {
  const state = await readBranchSettingsState(db, locationId);
  return (
    fieldsEqual(state.fields, SAMPLE_BRANCH_SETTINGS) &&
    hoursEqual(state.hoursByDay, SAMPLE_HOURS_BY_DAY)
  );
}

export function sampleBranchSettingsAuditValue(): Omit<BranchSettingsWire, "version"> {
  const { version: _version, ...value } = toBranchSettingsWire({
    ...SAMPLE_BRANCH_SETTINGS,
    version: 0,
    hours: SAMPLE_HOURS_BY_DAY.flatMap((ranges, dayIndex) =>
      ranges.map((range, position) => ({ dayOfWeek: dayIndex + 1, position, ...range })),
    ),
  });
  return value;
}
