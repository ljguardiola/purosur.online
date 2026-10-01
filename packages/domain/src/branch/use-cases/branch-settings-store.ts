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

export interface NewBranchSettingsVersion extends BranchSettings {
  locationId: string;
  recordedBy: string;
}

export interface BranchSettingsPorts {
  store: BranchSettingsStore;
}

export interface BranchSettingsStore {
  transaction<TOutcome>(
    work: (tx: BranchSettingsStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface BranchSettingsStoreTransaction {
  lockCurrentBranchSettings(locationId: string): Promise<BranchSettings>;
  recordBranchSettingsVersion(
    next: NewBranchSettingsVersion,
    previous: BranchSettings,
  ): Promise<void>;
}
