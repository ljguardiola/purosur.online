import type { UserChange } from "./user-store.js";

export interface RecipientsChangedAlert {
  userId: string;
  change: "opted_in" | "withdrawn";
  actorId: string;
  openedAt: Date;
}

export interface AlertEmailOptInStore {
  transaction<TOutcome>(
    work: (tx: AlertEmailOptInStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface AlertEmailOptInStoreTransaction {
  // Finds only an active user of the branch, and takes the user's lock so two changes of the same opt-in run one after the other.
  lockBranchUserOptIn(
    userId: string,
    locationId: string,
  ): Promise<{ optedInAt: Date | null } | undefined>;
  recordOptIn(userId: string, at: Date): Promise<void>;
  clearOptIn(userId: string): Promise<void>;
  recordUserChange(userId: string, actorId: string, change: UserChange): Promise<void>;
  openRecipientsChangedAlert(alert: RecipientsChangedAlert): Promise<void>;
}
