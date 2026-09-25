export type BranchSettingsHours = { opensAt: string; closesAt: string } | null;

export type BranchSettings = {
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
};

export type BranchSettingsHoursWire = { opens_at: string; closes_at: string } | null;

export type BranchSettingsWire = {
  address: string;
  whatsapp_number: string;
  instagram_handle: string;
  weekday_hours: BranchSettingsHoursWire;
  saturday_hours: BranchSettingsHoursWire;
  sunday_hours: BranchSettingsHoursWire;
  expiring_lot_alert_days: number;
  unreviewed_price_alert_days: number;
  good_condition_return_days: number;
  version: number;
};

export type BranchSettingsField =
  | "address"
  | "whatsapp_number"
  | "instagram_handle"
  | "weekday_hours"
  | "saturday_hours"
  | "sunday_hours"
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

function hoursFromWire(hours: BranchSettingsHoursWire): BranchSettingsHours {
  return hours === null ? null : { opensAt: hours.opens_at, closesAt: hours.closes_at };
}

function hoursToWire(hours: BranchSettingsHours): BranchSettingsHoursWire {
  return hours === null ? null : { opens_at: hours.opensAt, closes_at: hours.closesAt };
}

function branchSettingsFromWire(row: BranchSettingsWire): BranchSettings {
  return {
    address: row.address,
    whatsappNumber: row.whatsapp_number,
    instagramHandle: row.instagram_handle,
    weekdayHours: hoursFromWire(row.weekday_hours),
    saturdayHours: hoursFromWire(row.saturday_hours),
    sundayHours: hoursFromWire(row.sunday_hours),
    expiringLotAlertDays: row.expiring_lot_alert_days,
    unreviewedPriceAlertDays: row.unreviewed_price_alert_days,
    goodConditionReturnDays: row.good_condition_return_days,
    version: row.version,
  };
}

function branchSettingsToWire(settings: BranchSettings): BranchSettingsWire {
  return {
    address: settings.address,
    whatsapp_number: settings.whatsappNumber,
    instagram_handle: settings.instagramHandle,
    weekday_hours: hoursToWire(settings.weekdayHours),
    saturday_hours: hoursToWire(settings.saturdayHours),
    sunday_hours: hoursToWire(settings.sundayHours),
    expiring_lot_alert_days: settings.expiringLotAlertDays,
    unreviewed_price_alert_days: settings.unreviewedPriceAlertDays,
    good_condition_return_days: settings.goodConditionReturnDays,
    version: settings.version,
  };
}

function branchSettingsFieldFromWire(field: unknown): BranchSettingsField | undefined {
  const fields: readonly BranchSettingsField[] = [
    "address",
    "whatsapp_number",
    "instagram_handle",
    "weekday_hours",
    "saturday_hours",
    "sunday_hours",
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
