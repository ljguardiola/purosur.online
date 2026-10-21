import type { RestoredRegisterPredecessors } from "./restored-register-predecessors.js";

export interface AdmitRestoredRegisterReplenishmentPorts {
  predecessors: RestoredRegisterPredecessors;
}

export interface AdmitRestoredRegisterReplenishmentInput {
  registerId: string;
  predecessorDeviceId: string;
  cursorDeviceId?: string;
}

export type AdmitRestoredRegisterReplenishmentOutcome =
  | { kind: "predecessor_not_of_register" }
  | { kind: "predecessor_not_revoked" }
  | { kind: "cursor_not_of_replenishment" }
  | { kind: "admitted" };

export async function admitRestoredRegisterReplenishment(
  { predecessors }: AdmitRestoredRegisterReplenishmentPorts,
  { registerId, predecessorDeviceId, cursorDeviceId }: AdmitRestoredRegisterReplenishmentInput,
): Promise<AdmitRestoredRegisterReplenishmentOutcome> {
  const standing = await predecessors.predecessorStanding(registerId, predecessorDeviceId);
  if (standing === "not_of_register") {
    return { kind: "predecessor_not_of_register" };
  }
  if (standing === "not_revoked") {
    return { kind: "predecessor_not_revoked" };
  }
  if (
    cursorDeviceId !== undefined &&
    !(await predecessors.isReplenishmentCursor(registerId, predecessorDeviceId, cursorDeviceId))
  ) {
    return { kind: "cursor_not_of_replenishment" };
  }
  return { kind: "admitted" };
}
