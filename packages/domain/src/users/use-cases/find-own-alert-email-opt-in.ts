import type { AlertEmailOptInReads } from "./alert-email-opt-in-reads.js";

export interface FindOwnAlertEmailOptInPorts {
  reads: AlertEmailOptInReads;
}

export interface FindOwnAlertEmailOptInInput {
  userId: string;
  locationId: string;
}

export function findOwnAlertEmailOptIn(
  { reads }: FindOwnAlertEmailOptInPorts,
  input: FindOwnAlertEmailOptInInput,
): Promise<{ optedInAt: Date | null } | undefined> {
  return reads.findAlertEmailOptIn(input.userId, input.locationId);
}
