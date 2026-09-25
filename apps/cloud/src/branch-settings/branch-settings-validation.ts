// No field-specific length is documented anywhere in the codebase (the same gap
// `user-creation-route.ts` notes for `first_name`), so every free-text field here shares one
// generous bound: long enough for a ticket header line or a schedule note, short enough to guard
// against an unbounded payload.
export const BRANCH_SETTINGS_TEXT_MAX_LENGTH = 200;

/**
 * `Intl.supportedValuesOf("timeZone")` only lists ICU's canonical zone names, not every valid IANA
 * identifier: it omits links like `America/Argentina/Buenos_Aires` (the schema's own seeded
 * default, an alias of the canonical `America/Buenos_Aires`), so checking membership in that list
 * would reject the very value every branch starts with. Constructing an `Intl.DateTimeFormat` with
 * the candidate as its `timeZone` throws for a genuinely invalid identifier while accepting both
 * canonical names and their aliases, so that is what actually validates "is this a real IANA time
 * zone id" here.
 */
function isSupportedTimeZone(candidate: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
}

export interface BranchSettingsFieldValidationFailure {
  field:
    | "business_name"
    | "address"
    | "whatsapp_number"
    | "instagram_handle"
    | "weekday_hours"
    | "saturday_hours"
    | "sunday_hours"
    | "timezone"
    | "expiring_lot_alert_days"
    | "unreviewed_price_alert_days"
    | "good_condition_return_days"
    | "defective_return_days"
    | "version";
  message: string;
}

export interface BranchSettingsEditInput {
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

function readText(body: unknown, key: string): string | undefined {
  const raw = (body as Record<string, unknown> | undefined)?.[key];
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length <= BRANCH_SETTINGS_TEXT_MAX_LENGTH ? trimmed : undefined;
}

function readTimezone(body: unknown): string | undefined {
  const raw = (body as { timezone?: unknown } | undefined)?.timezone;
  return typeof raw === "string" && raw.length > 0 && isSupportedTimeZone(raw) ? raw : undefined;
}

function readNonNegativeInteger(body: unknown, key: string): number | undefined {
  const raw = (body as Record<string, unknown> | undefined)?.[key];
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}

/**
 * The window for returning a defective product has a legal floor of 180 days (six months) that a
 * branch can never shorten, because it comes from a warranty the law doesn't allow reducing
 * against the buyer; the window for a product in good condition has no such floor.
 */
function readDefectiveReturnDays(body: unknown): number | undefined {
  const raw = (body as { defective_return_days?: unknown } | undefined)?.defective_return_days;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 180 ? raw : undefined;
}

function readVersion(body: unknown): number | undefined {
  const raw = (body as { version?: unknown } | undefined)?.version;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : undefined;
}

/**
 * Parses and validates a `PUT /branch-settings` body, mirroring how `role-validation.ts` reads and
 * validates a role edit. Every text field may be empty: the ticket header and hours are optional
 * until the branch fills them in, the same way the seeded row's own defaults are empty strings.
 */
export function readBranchSettingsEditBody(
  body: unknown,
): BranchSettingsEditInput | BranchSettingsFieldValidationFailure {
  const businessName = readText(body, "business_name");
  if (businessName === undefined) {
    return {
      field: "business_name",
      message: `business_name must be a string of at most ${BRANCH_SETTINGS_TEXT_MAX_LENGTH} characters`,
    };
  }
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
  const weekdayHours = readText(body, "weekday_hours");
  if (weekdayHours === undefined) {
    return {
      field: "weekday_hours",
      message: `weekday_hours must be a string of at most ${BRANCH_SETTINGS_TEXT_MAX_LENGTH} characters`,
    };
  }
  const saturdayHours = readText(body, "saturday_hours");
  if (saturdayHours === undefined) {
    return {
      field: "saturday_hours",
      message: `saturday_hours must be a string of at most ${BRANCH_SETTINGS_TEXT_MAX_LENGTH} characters`,
    };
  }
  const sundayHours = readText(body, "sunday_hours");
  if (sundayHours === undefined) {
    return {
      field: "sunday_hours",
      message: `sunday_hours must be a string of at most ${BRANCH_SETTINGS_TEXT_MAX_LENGTH} characters`,
    };
  }
  const timezone = readTimezone(body);
  if (timezone === undefined) {
    return {
      field: "timezone",
      message: "timezone must be a supported IANA time zone identifier",
    };
  }
  const expiringLotAlertDays = readNonNegativeInteger(body, "expiring_lot_alert_days");
  if (expiringLotAlertDays === undefined) {
    return {
      field: "expiring_lot_alert_days",
      message: "expiring_lot_alert_days must be an integer of at least 0",
    };
  }
  const unreviewedPriceAlertDays = readNonNegativeInteger(body, "unreviewed_price_alert_days");
  if (unreviewedPriceAlertDays === undefined) {
    return {
      field: "unreviewed_price_alert_days",
      message: "unreviewed_price_alert_days must be an integer of at least 0",
    };
  }
  const goodConditionReturnDays = readNonNegativeInteger(body, "good_condition_return_days");
  if (goodConditionReturnDays === undefined) {
    return {
      field: "good_condition_return_days",
      message: "good_condition_return_days must be an integer of at least 0",
    };
  }
  const defectiveReturnDays = readDefectiveReturnDays(body);
  if (defectiveReturnDays === undefined) {
    return {
      field: "defective_return_days",
      message:
        "defective_return_days must be an integer of at least 180: the legal floor a branch can never shorten",
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
    businessName,
    address,
    whatsappNumber,
    instagramHandle,
    weekdayHours,
    saturdayHours,
    sundayHours,
    timezone,
    expiringLotAlertDays,
    unreviewedPriceAlertDays,
    goodConditionReturnDays,
    defectiveReturnDays,
    version,
  };
}
