import type { BranchSettingsBody } from "@purosur/contracts";
import type { BranchDayHoursRange, BranchSettings } from "@purosur/domain/branch/use-cases";

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

type BranchHoursRangeWire = BranchSettingsBody[(typeof BRANCH_SETTINGS_DAY_FIELDS)[number]][number];

function dayHoursWireInPositionOrder(
  hours: BranchDayHoursRange[],
  dayOfWeek: number,
): BranchHoursRangeWire[] {
  return hours
    .filter((range) => range.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.position - b.position)
    .map((range) => ({ opens_at: range.opensAt, closes_at: range.closesAt }));
}

export function toBranchSettingsWire(settings: BranchSettings): BranchSettingsBody {
  const wire = {
    address: settings.address,
    whatsapp_number: settings.whatsappNumber,
    instagram_handle: settings.instagramHandle,
    expiring_lot_alert_days: settings.expiringLotAlertDays,
    unreviewed_price_alert_days: settings.unreviewedPriceAlertDays,
    good_condition_return_days: settings.goodConditionReturnDays,
    version: settings.version,
  } as BranchSettingsBody;
  BRANCH_SETTINGS_DAY_FIELDS.forEach((field, index) => {
    wire[field] = dayHoursWireInPositionOrder(settings.hours, index + 1);
  });
  return wire;
}
