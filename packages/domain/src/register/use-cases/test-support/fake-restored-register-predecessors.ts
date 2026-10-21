import type {
  PredecessorStanding,
  RestoredRegisterPredecessors,
} from "../restored-register-predecessors.js";

export interface CursorCheck {
  registerId: string;
  predecessorDeviceId: string;
  cursorDeviceId: string;
}

export class FakeRestoredRegisterPredecessors implements RestoredRegisterPredecessors {
  standings = new Map<string, PredecessorStanding>();
  refusedCursorDeviceIds = new Set<string>();
  cursorChecks: CursorCheck[] = [];

  async predecessorStanding(
    registerId: string,
    predecessorDeviceId: string,
  ): Promise<PredecessorStanding> {
    return this.standings.get(`${registerId}/${predecessorDeviceId}`) ?? "not_of_register";
  }

  async isReplenishmentCursor(
    registerId: string,
    predecessorDeviceId: string,
    cursorDeviceId: string,
  ): Promise<boolean> {
    this.cursorChecks.push({ registerId, predecessorDeviceId, cursorDeviceId });
    return !this.refusedCursorDeviceIds.has(cursorDeviceId);
  }
}
