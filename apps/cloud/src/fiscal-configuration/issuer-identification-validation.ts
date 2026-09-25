// Mirrors `@purosur/contracts`'s issuer identification limits and Argentina calendar day because this app's `tsc` build (explicit
// `rootDir`) cannot import that package's untranspiled source;
// `issuer-identification-validation.test.ts` guards against drift.
export const ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH = 200;
export const ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH = 100;
export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

// The en-CA locale formats a date as YYYY-MM-DD, the ISO calendar date shape.
const ARGENTINA_ISO_DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ARGENTINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function argentinaCalendarDay(instant: Date): string {
  return ARGENTINA_ISO_DAY_FORMAT.format(instant);
}

const ACTIVITY_START_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface IssuerIdentificationFieldValidationFailure {
  field: "legal_name" | "gross_income_registration" | "activity_start_date" | "version";
  message: string;
}

export interface IssuerIdentificationEditInput {
  legalName: string;
  grossIncomeRegistration: string;
  /** A zero-padded ISO calendar date (YYYY-MM-DD), never in the future. */
  activityStartDate: string;
  version: number;
}

function readRequiredText(body: unknown, key: string, maxLength: number): string | undefined {
  const raw = (body as Record<string, unknown> | undefined)?.[key];
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : undefined;
}

/** True for a real calendar date: rejects e.g. "2020-02-30", which `Date` would otherwise roll over. */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function readActivityStartDate(body: unknown, today: Date): string | undefined {
  const raw = (body as Record<string, unknown> | undefined)?.activity_start_date;
  if (typeof raw !== "string") {
    return undefined;
  }
  const match = ACTIVITY_START_DATE_PATTERN.exec(raw);
  if (!match) {
    return undefined;
  }
  const [, yearText, monthText, dayText] = match as unknown as [string, string, string, string];
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isRealCalendarDate(year, month, day)) {
    return undefined;
  }
  return raw <= argentinaCalendarDay(today) ? raw : undefined;
}

function readVersion(body: unknown): number | undefined {
  const raw = (body as { version?: unknown } | undefined)?.version;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : undefined;
}

/**
 * Parses and validates a `PUT /fiscal-configuration/issuer-identification` body, mirroring how
 * `branch-settings-validation.ts` reads and validates a branch settings edit. Every field is
 * required: the incomplete state only exists before the first save, so a save never clears a
 * value. `authorized_cuit` and `tax_status` are never read here even if a client sends them: the
 * authorized CUIT and tax status come only from deployment configuration, never from a request
 * body.
 */
export function readIssuerIdentificationEditBody(
  body: unknown,
  today: Date,
): IssuerIdentificationEditInput | IssuerIdentificationFieldValidationFailure {
  const legalName = readRequiredText(
    body,
    "legal_name",
    ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
  );
  if (legalName === undefined) {
    return {
      field: "legal_name",
      message: `legal_name must be a non-empty string of at most ${ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH} characters`,
    };
  }
  const grossIncomeRegistration = readRequiredText(
    body,
    "gross_income_registration",
    ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  );
  if (grossIncomeRegistration === undefined) {
    return {
      field: "gross_income_registration",
      message: `gross_income_registration must be a non-empty string of at most ${ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH} characters`,
    };
  }
  const activityStartDate = readActivityStartDate(body, today);
  if (activityStartDate === undefined) {
    return {
      field: "activity_start_date",
      message:
        "activity_start_date must be a valid ISO calendar date (YYYY-MM-DD), not in the future",
    };
  }
  const version = readVersion(body);
  if (version === undefined) {
    return {
      field: "version",
      message: "version must be the positive integer it was loaded with",
    };
  }

  return { legalName, grossIncomeRegistration, activityStartDate, version };
}
