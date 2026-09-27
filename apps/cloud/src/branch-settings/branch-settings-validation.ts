import { BRANCH_HOURS_RANGES_PER_DAY_MAX, BRANCH_SETTINGS_DAYS_MAX } from "@purosur/contracts";
export const BRANCH_SETTINGS_TEXT_MAX_LENGTH = 200;

const HOURS_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Monday..Sunday order, matching how `day_of_week` numbers them in `branch_hours` (1 = Monday).
export const BRANCH_SETTINGS_DAY_FIELDS = [
  "monday_hours",
  "tuesday_hours",
  "wednesday_hours",
  "thursday_hours",
  "friday_hours",
  "saturday_hours",
  "sunday_hours",
] as const;

export type BranchSettingsDayField = (typeof BRANCH_SETTINGS_DAY_FIELDS)[number];

export interface BranchSettingsFieldValidationFailure {
  field:
    | "address"
    | "whatsapp_number"
    | "instagram_handle"
    | BranchSettingsDayField
    | "expiring_lot_alert_days"
    | "unreviewed_price_alert_days"
    | "good_condition_return_days"
    | "version";
  message: string;
}

export interface BranchHoursRange {
  opensAt: string;
  closesAt: string;
}

export interface BranchSettingsEditInput {
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

function readText(body: unknown, key: string): string | undefined {
  const raw = (body as Record<string, unknown> | undefined)?.[key];
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length <= BRANCH_SETTINGS_TEXT_MAX_LENGTH ? trimmed : undefined;
}

function readRange(raw: unknown): BranchHoursRange | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { opens_at: opensAt, closes_at: closesAt } = raw as Record<string, unknown>;
  if (
    typeof opensAt !== "string" ||
    typeof closesAt !== "string" ||
    !HOURS_TIME_PATTERN.test(opensAt) ||
    !HOURS_TIME_PATTERN.test(closesAt) ||
    closesAt <= opensAt
  ) {
    return undefined;
  }
  return { opensAt, closesAt };
}

// Zero-padded HH:MM strings compare lexicographically the same way the times they represent do.
function rangesOverlap(ranges: BranchHoursRange[]): boolean {
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      if (a !== undefined && b !== undefined && a.opensAt < b.closesAt && b.opensAt < a.closesAt) {
        return true;
      }
    }
  }
  return false;
}

function readDayHours(body: unknown, key: BranchSettingsDayField): BranchHoursRange[] | undefined {
  const raw = (body as Record<string, unknown> | undefined)?.[key];
  if (!Array.isArray(raw) || raw.length > BRANCH_HOURS_RANGES_PER_DAY_MAX) {
    return undefined;
  }
  const ranges: BranchHoursRange[] = [];
  for (const entry of raw) {
    const range = readRange(entry);
    if (!range) {
      return undefined;
    }
    ranges.push(range);
  }
  if (rangesOverlap(ranges)) {
    return undefined;
  }
  return ranges;
}

function readDays(body: unknown, key: string): number | undefined {
  const raw = (body as Record<string, unknown> | undefined)?.[key];
  return typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= 0 &&
    raw <= BRANCH_SETTINGS_DAYS_MAX
    ? raw
    : undefined;
}

function readVersion(body: unknown): number | undefined {
  const raw = (body as { version?: unknown } | undefined)?.version;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : undefined;
}

export function readBranchSettingsEditBody(
  body: unknown,
): BranchSettingsEditInput | BranchSettingsFieldValidationFailure {
  const address = readText(body, "address");
  if (address === undefined) {
    return {
      field: "address",
      message: `address must be a string of at most ${BRANCH_SETTINGS_TEXT_MAX_LENGTH} characters`,
    };
  }
  const whatsappNumber = readText(body, "whatsapp_number");
  if (whatsappNumber === undefined) {
    return {
      field: "whatsapp_number",
      message: `whatsapp_number must be a string of at most ${BRANCH_SETTINGS_TEXT_MAX_LENGTH} characters`,
    };
  }
  const instagramHandle = readText(body, "instagram_handle");
  if (instagramHandle === undefined) {
    return {
      field: "instagram_handle",
      message: `instagram_handle must be a string of at most ${BRANCH_SETTINGS_TEXT_MAX_LENGTH} characters`,
    };
  }

  const dayHours: Record<BranchSettingsDayField, BranchHoursRange[]> = {} as Record<
    BranchSettingsDayField,
    BranchHoursRange[]
  >;
  for (const field of BRANCH_SETTINGS_DAY_FIELDS) {
    const ranges = readDayHours(body, field);
    if (ranges === undefined) {
      return {
        field,
        message: `${field} must be a list of at most ${BRANCH_HOURS_RANGES_PER_DAY_MAX} non-overlapping HH:MM opens_at/closes_at ranges, each with closes_at later`,
      };
    }
    dayHours[field] = ranges;
  }

  const expiringLotAlertDays = readDays(body, "expiring_lot_alert_days");
  if (expiringLotAlertDays === undefined) {
    return {
      field: "expiring_lot_alert_days",
      message: `expiring_lot_alert_days must be an integer from 0 to ${BRANCH_SETTINGS_DAYS_MAX}`,
    };
  }
  const unreviewedPriceAlertDays = readDays(body, "unreviewed_price_alert_days");
  if (unreviewedPriceAlertDays === undefined) {
    return {
      field: "unreviewed_price_alert_days",
      message: `unreviewed_price_alert_days must be an integer from 0 to ${BRANCH_SETTINGS_DAYS_MAX}`,
    };
  }
  const goodConditionReturnDays = readDays(body, "good_condition_return_days");
  if (goodConditionReturnDays === undefined) {
    return {
      field: "good_condition_return_days",
      message: `good_condition_return_days must be an integer from 0 to ${BRANCH_SETTINGS_DAYS_MAX}`,
    };
  }
  const version = readVersion(body);
  if (version === undefined) {
    return {
      field: "version",
      message: "version must be the positive integer it was loaded with",
    };
  }

  return {
    address,
    whatsappNumber,
    instagramHandle,
    mondayHours: dayHours.monday_hours,
    tuesdayHours: dayHours.tuesday_hours,
    wednesdayHours: dayHours.wednesday_hours,
    thursdayHours: dayHours.thursday_hours,
    fridayHours: dayHours.friday_hours,
    saturdayHours: dayHours.saturday_hours,
    sundayHours: dayHours.sunday_hours,
    expiringLotAlertDays,
    unreviewedPriceAlertDays,
    goodConditionReturnDays,
    version,
  };
}
