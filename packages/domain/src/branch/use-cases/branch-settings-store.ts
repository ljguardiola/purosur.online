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

export interface EditableBranchSettings extends BranchSettings {
  supplierPriceListDailyExtractionCap: number;
}

export interface BranchSettingsReader {
  currentBranchSettings(locationId: string): Promise<EditableBranchSettings>;
}

export interface NewBranchSettingsVersion extends EditableBranchSettings {
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
  lockCurrentBranchSettings(locationId: string): Promise<EditableBranchSettings>;
  recordBranchSettingsVersion(
    next: NewBranchSettingsVersion,
    previous: EditableBranchSettings,
  ): Promise<void>;
}
