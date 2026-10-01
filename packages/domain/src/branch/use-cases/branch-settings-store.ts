export interface BranchHoursRange {
  opensAt: string;
  closesAt: string;
}

export interface BranchDayHoursRange extends BranchHoursRange {
  dayOfWeek: number;
  position: number;
}

export interface BranchSettings {
  address: string;
  whatsappNumber: string;
  instagramHandle: string;
  hours: BranchDayHoursRange[];
  expiringLotAlertDays: number;
  unreviewedPriceAlertDays: number;
  goodConditionReturnDays: number;
  version: number;
}

export interface BranchSettingsReader {
  currentBranchSettings(locationId: string): Promise<BranchSettings>;
}
