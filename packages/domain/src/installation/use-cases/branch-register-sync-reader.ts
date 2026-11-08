export type RegisterBatteryState =
  | { present: false }
  | {
      present: true;
      chargePercent: number;
      healthPercent: number | null;
      onBattery: boolean;
      onBatteryMinutes: number;
    };

export interface RegisterDiskState {
  freeBytes: number;
  freeRatio: number;
}

export interface BranchRegisterLastSync {
  id: string;
  name: string;
  lastSuccessfulSyncAt: Date | null;
  // Reported by the installation that synced last; null when it never reported.
  battery: RegisterBatteryState | null;
  disk: RegisterDiskState | null;
}

export interface BranchRegisterSyncReader {
  // A successful sync is a push the cloud accepted. Ordered by register name.
  lastSuccessfulSyncOfBranchRegisters(locationId: string): Promise<BranchRegisterLastSync[]>;
}
