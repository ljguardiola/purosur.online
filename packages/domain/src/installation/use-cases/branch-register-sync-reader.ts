export interface BranchRegisterLastSync {
  id: string;
  name: string;
  lastSuccessfulSyncAt: Date | null;
}

export interface BranchRegisterSyncReader {
  // A successful sync is a push the cloud accepted. Ordered by register name.
  lastSuccessfulSyncOfBranchRegisters(locationId: string): Promise<BranchRegisterLastSync[]>;
}
