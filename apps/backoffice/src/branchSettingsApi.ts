export type BranchSettings = {
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
};

export type BranchSettingsWire = {
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
};

export type BranchSettingsField =
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

function branchSettingsFromWire(row: BranchSettingsWire): BranchSettings {
  return {
    businessName: row.business_name,
    address: row.address,
    whatsappNumber: row.whatsapp_number,
    instagramHandle: row.instagram_handle,
    weekdayHours: row.weekday_hours,
    saturdayHours: row.saturday_hours,
    sundayHours: row.sunday_hours,
    timezone: row.timezone,
    expiringLotAlertDays: row.expiring_lot_alert_days,
    unreviewedPriceAlertDays: row.unreviewed_price_alert_days,
    goodConditionReturnDays: row.good_condition_return_days,
    defectiveReturnDays: row.defective_return_days,
    version: row.version,
  };
}

function branchSettingsToWire(settings: BranchSettings): BranchSettingsWire {
  return {
    business_name: settings.businessName,
    address: settings.address,
    whatsapp_number: settings.whatsappNumber,
    instagram_handle: settings.instagramHandle,
    weekday_hours: settings.weekdayHours,
    saturday_hours: settings.saturdayHours,
    sunday_hours: settings.sundayHours,
    timezone: settings.timezone,
    expiring_lot_alert_days: settings.expiringLotAlertDays,
    unreviewed_price_alert_days: settings.unreviewedPriceAlertDays,
    good_condition_return_days: settings.goodConditionReturnDays,
    defective_return_days: settings.defectiveReturnDays,
    version: settings.version,
  };
}

function branchSettingsFieldFromWire(field: unknown): BranchSettingsField | undefined {
  const fields: readonly BranchSettingsField[] = [
    "business_name",
    "address",
    "whatsapp_number",
    "instagram_handle",
    "weekday_hours",
    "saturday_hours",
    "sunday_hours",
    "timezone",
    "expiring_lot_alert_days",
    "unreviewed_price_alert_days",
    "good_condition_return_days",
    "defective_return_days",
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
