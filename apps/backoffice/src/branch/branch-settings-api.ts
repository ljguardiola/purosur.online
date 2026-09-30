import {
  type BranchSettingsBody,
  type BranchSettingsEditBody,
  branchSettingsSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterSeconds } from "../platform/retry-after-seconds";
import { readValidationFailedField } from "../platform/validation-failed-field";

export type BranchDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const BRANCH_DAYS: readonly BranchDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

type BranchHoursRange = { opensAt: string; closesAt: string };

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

type BranchHoursRangeWire = BranchSettingsBody["monday_hours"][number];

type BranchSettingsDayField =
  | "monday_hours"
  | "tuesday_hours"
  | "wednesday_hours"
  | "thursday_hours"
  | "friday_hours"
  | "saturday_hours"
  | "sunday_hours";

export type FetchBranchSettingsOutcome = CloudReadOutcome<BranchSettings>;

export type SaveBranchSettingsOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "stale_version" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "failed" };

const DAY_FIELD_OF: Record<BranchDay, BranchSettingsDayField> = {
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

function branchSettingsFromWire(row: BranchSettingsBody): BranchSettings {
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

export async function fetchBranchSettings(): Promise<FetchBranchSettingsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/locations/current/settings");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response) };
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const parsed = branchSettingsSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return { kind: "ok", value: branchSettingsFromWire(parsed.data) };
}

export async function saveBranchSettings(
  requestBody: BranchSettingsEditBody,
): Promise<SaveBranchSettingsOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/locations/current/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
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
