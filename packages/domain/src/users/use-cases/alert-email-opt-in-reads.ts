export interface AlertEmailOptInReads {
  // Only an active user of the branch has an opt-in to read.
  findAlertEmailOptIn(
    userId: string,
    locationId: string,
  ): Promise<{ optedInAt: Date | null } | undefined>;
}
