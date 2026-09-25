export type BranchDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

// Monday through Sunday, the order the "Horario de atención" rows appear in and the order the
// wire's own `<day>_hours` fields are read in.
export const BRANCH_DAYS: readonly BranchDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export type BranchHoursRange = { opensAt: string; closesAt: string };

export type BranchSettings = {
  address: string;
  whatsappNumber: string;
  instagramHandle: string;
  hours: Record<BranchDay, BranchHoursRange[]>;
  expiringLotAlertDays: number;
  unreviewedPriceAlertDays: number;
  goodConditionReturnDays: number;
  version: number;
};

export type BranchHoursRangeWire = { opens_at: string; closes_at: string };

export type BranchSettingsDayField =
  | "monday_hours"
  | "tuesday_hours"
  | "wednesday_hours"
  | "thursday_hours"
  | "friday_hours"
  | "saturday_hours"
  | "sunday_hours";

export type BranchSettingsWire = {
  address: string;
  whatsapp_number: string;
  instagram_handle: string;
  expiring_lot_alert_days: number;
  unreviewed_price_alert_days: number;
  good_condition_return_days: number;
  version: number;
} & Record<BranchSettingsDayField, BranchHoursRangeWire[]>;

export type BranchSettingsField =
  | "address"
  | "whatsapp_number"
  | "instagram_handle"
  | BranchSettingsDayField
  | "expiring_lot_alert_days"
  | "unreviewed_price_alert_days"
  | "good_condition_return_days"
  | "version";

export type FetchBranchSettingsOutcome =
  | { kind: "ok"; value: BranchSettings }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

export type SaveBranchSettingsOutcome =
  | { kind: "ok"; value: BranchSettings }
  | { kind: "validation_failed"; field: BranchSettingsField }
  | { kind: "stale_version" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

export const DAY_FIELD_OF: Record<BranchDay, BranchSettingsDayField> = {
  monday: "monday_hours",
  tuesday: "tuesday_hours",
  wednesday: "wednesday_hours",
  thursday: "thursday_hours",
  friday: "friday_hours",
  saturday: "saturday_hours",
  sunday: "sunday_hours",
};

function rangesFromWire(ranges: BranchHoursRangeWire[]): BranchHoursRange[] {
  return ranges.map((range) => ({ opensAt: range.opens_at, closesAt: range.closes_at }));
}

function rangesToWire(ranges: BranchHoursRange[]): BranchHoursRangeWire[] {
  return ranges.map((range) => ({ opens_at: range.opensAt, closes_at: range.closesAt }));
}

function branchSettingsFromWire(row: BranchSettingsWire): BranchSettings {
  const hours = {} as Record<BranchDay, BranchHoursRange[]>;
  for (const day of BRANCH_DAYS) {
    hours[day] = rangesFromWire(row[DAY_FIELD_OF[day]]);
  }
  return {
    address: row.address,
    whatsappNumber: row.whatsapp_number,
    instagramHandle: row.instagram_handle,
    hours,
    expiringLotAlertDays: row.expiring_lot_alert_days,
    unreviewedPriceAlertDays: row.unreviewed_price_alert_days,
    goodConditionReturnDays: row.good_condition_return_days,
    version: row.version,
  };
}

function branchSettingsToWire(settings: BranchSettings): BranchSettingsWire {
  const wire = {
    address: settings.address,
    whatsapp_number: settings.whatsappNumber,
    instagram_handle: settings.instagramHandle,
    expiring_lot_alert_days: settings.expiringLotAlertDays,
    unreviewed_price_alert_days: settings.unreviewedPriceAlertDays,
    good_condition_return_days: settings.goodConditionReturnDays,
    version: settings.version,
  } as BranchSettingsWire;
  for (const day of BRANCH_DAYS) {
    wire[DAY_FIELD_OF[day]] = rangesToWire(settings.hours[day]);
  }
  return wire;
}

function branchSettingsFieldFromWire(field: unknown): BranchSettingsField | undefined {
  const fields: readonly BranchSettingsField[] = [
    "address",
    "whatsapp_number",
    "instagram_handle",
    ...BRANCH_DAYS.map((day) => DAY_FIELD_OF[day]),
    "expiring_lot_alert_days",
    "unreviewed_price_alert_days",
    "good_condition_return_days",
    "version",
  ];
  return fields.find((candidate) => candidate === field);
}

/** Reads the requesting user's own branch's settings, gated by `configure_branch` (`GET /branch-settings`). */
export async function fetchBranchSettings(): Promise<FetchBranchSettingsOutcome> {
  let response: Response;
  try {
    response = await fetch("/branch-settings");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const body = (await response.json().catch(() => undefined)) as BranchSettingsWire | undefined;
  if (!body) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: branchSettingsFromWire(body) };
}

/** Saves the branch's settings, rejecting a save over a version someone else already changed (`PUT /branch-settings`). */
export async function saveBranchSettings(
  settings: BranchSettings,
): Promise<SaveBranchSettingsOutcome> {
  let response: Response;
  try {
    response = await fetch("/branch-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(branchSettingsToWire(settings)),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => undefined)) as BranchSettingsWire | undefined;
    if (!body) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: branchSettingsFromWire(body) };
  }
  if (response.status === 400) {
    const body = (await response.json().catch(() => undefined)) as
      | { code?: string; details?: Array<{ field?: string }> }
      | undefined;
    if (body?.code === "validation_failed") {
      const field = branchSettingsFieldFromWire(body.details?.[0]?.field);
      if (field) {
        return { kind: "validation_failed", field };
      }
    }
    return { kind: "failed" };
  }
  if (response.status === 409) {
    return { kind: "stale_version" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  return { kind: "failed" };
}
