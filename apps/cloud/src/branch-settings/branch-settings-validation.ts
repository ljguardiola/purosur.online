// No field-specific length is documented anywhere in the codebase (the same gap
// `user-creation-route.ts` notes for `first_name`), so every free-text field here shares one
// generous bound: long enough for a ticket header line, short enough to guard against an
// unbounded payload.
export const BRANCH_SETTINGS_TEXT_MAX_LENGTH = 200;

const HOURS_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type BranchSettingsHoursGroup = "weekday_hours" | "saturday_hours" | "sunday_hours";

export interface BranchSettingsFieldValidationFailure {
  field:
    | "address"
    | "whatsapp_number"
    | "instagram_handle"
    | BranchSettingsHoursGroup
    | "expiring_lot_alert_days"
    | "unreviewed_price_alert_days"
    | "good_condition_return_days"
    | "version";
  message: string;
}

export interface BranchSettingsHours {
  opensAt: string | null;
  closesAt: string | null;
}

export interface BranchSettingsEditInput {
  address: string;
  whatsappNumber: string;
  instagramHandle: string;
  weekdayHours: BranchSettingsHours;
  saturdayHours: BranchSettingsHours;
  sundayHours: BranchSettingsHours;
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

/**
 * Reads one hours group: `null` (closed) or `{ opens_at, closes_at }`, each a zero-padded 24h
 * `HH:MM`, with `closes_at` strictly later than `opens_at`. Comparing the two as plain strings is
 * enough because that format sorts the same way it reads: no calendar arithmetic is needed to
 * tell "09:00" is before "18:00".
 */
function readHoursGroup(
  body: unknown,
  key: BranchSettingsHoursGroup,
): BranchSettingsHours | undefined {
  const raw = (body as Record<string, unknown> | undefined)?.[key];
  if (raw === null) {
    return { opensAt: null, closesAt: null };
  }
  if (typeof raw !== "object" || raw === undefined) {
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

// The days columns are Postgres `integer` (int4): anything larger would fail the write itself.
export const BRANCH_SETTINGS_DAYS_MAX = 2147483647;

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

/**
 * Parses and validates a `PUT /branch-settings` body, mirroring how `role-validation.ts` reads and
 * validates a role edit. Every text field may be empty and every hours group may be closed: the
 * ticket header and hours are optional until the branch fills them in, the same way the seeded
 * row's own defaults are empty strings and closed groups.
 */
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
  const weekdayHours = readHoursGroup(body, "weekday_hours");
  if (weekdayHours === undefined) {
    return {
      field: "weekday_hours",
      message:
        "weekday_hours must be null or an HH:MM opens_at/closes_at pair with closes_at later",
    };
  }
  const saturdayHours = readHoursGroup(body, "saturday_hours");
  if (saturdayHours === undefined) {
    return {
      field: "saturday_hours",
      message:
        "saturday_hours must be null or an HH:MM opens_at/closes_at pair with closes_at later",
    };
  }
  const sundayHours = readHoursGroup(body, "sunday_hours");
  if (sundayHours === undefined) {
    return {
      field: "sunday_hours",
      message: "sunday_hours must be null or an HH:MM opens_at/closes_at pair with closes_at later",
    };
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
    weekdayHours,
    saturdayHours,
    sundayHours,
    expiringLotAlertDays,
    unreviewedPriceAlertDays,
    goodConditionReturnDays,
    version,
  };
}
