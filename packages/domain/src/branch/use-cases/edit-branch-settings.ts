import type {
  BranchDayHoursRange,
  BranchHoursRange,
  BranchSettings,
  BranchSettingsPorts,
} from "./branch-settings-store.js";

export interface EditBranchSettingsInput {
  locationId: string;
  actorId: string;
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

export type EditBranchSettingsOutcome =
  | { kind: "stale_version" }
  | { kind: "unchanged"; settings: BranchSettings }
  | { kind: "edited"; settings: BranchSettings };

function hoursOf(input: EditBranchSettingsInput): BranchDayHoursRange[] {
  const days = [
    input.mondayHours,
    input.tuesdayHours,
    input.wednesdayHours,
    input.thursdayHours,
    input.fridayHours,
    input.saturdayHours,
    input.sundayHours,
  ];
  return days.flatMap((ranges, dayIndex) =>
    ranges.map((range, position) => ({
      dayOfWeek: dayIndex + 1,
      position,
      opensAt: range.opensAt,
      closesAt: range.closesAt,
    })),
  );
}

function isSameHours(current: BranchDayHoursRange[], next: BranchDayHoursRange[]): boolean {
  return (
    current.length === next.length &&
    current.every((range, index) => {
      const other = next[index];
      return (
        other !== undefined &&
        range.dayOfWeek === other.dayOfWeek &&
        range.position === other.position &&
        range.opensAt === other.opensAt &&
        range.closesAt === other.closesAt
      );
    })
  );
}

function isSameBranchSettings(current: BranchSettings, next: Omit<BranchSettings, "version">) {
  return (
    current.address === next.address &&
    current.whatsappNumber === next.whatsappNumber &&
    current.instagramHandle === next.instagramHandle &&
    current.expiringLotAlertDays === next.expiringLotAlertDays &&
    current.unreviewedPriceAlertDays === next.unreviewedPriceAlertDays &&
    current.goodConditionReturnDays === next.goodConditionReturnDays &&
    isSameHours(current.hours, next.hours)
  );
}

export async function editBranchSettings(
  { store }: BranchSettingsPorts,
  input: EditBranchSettingsInput,
): Promise<EditBranchSettingsOutcome> {
  return store.transaction<EditBranchSettingsOutcome>(async (tx) => {
    const current = await tx.lockCurrentBranchSettings(input.locationId);
    if (current.version !== input.version) {
      return { kind: "stale_version" };
    }
    const next = {
      address: input.address,
      whatsappNumber: input.whatsappNumber,
      instagramHandle: input.instagramHandle,
      hours: hoursOf(input),
      expiringLotAlertDays: input.expiringLotAlertDays,
      unreviewedPriceAlertDays: input.unreviewedPriceAlertDays,
      goodConditionReturnDays: input.goodConditionReturnDays,
    };
    if (isSameBranchSettings(current, next)) {
      return { kind: "unchanged", settings: current };
    }

    const settings = { ...next, version: current.version + 1 };
    await tx.recordBranchSettingsVersion(
      { ...settings, locationId: input.locationId, recordedBy: input.actorId },
      current,
    );
    return { kind: "edited", settings };
  });
}
