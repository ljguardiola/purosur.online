import type { BranchWeeklyHoursRange } from "../../branch/index.js";
import { quietRegisterObservation } from "../model/alert-condition-observation.js";
import { isRegisterQuiet } from "../model/quiet-register.js";
import type { AlertClosingPorts } from "./alert-store.js";
import type { BranchHoursReader } from "./branch-hours-reader.js";
import { observeAlertCondition } from "./observe-alert-condition.js";
import type { WatchedRegisterReader } from "./watched-register-reader.js";

export interface QuietRegisterDetectionPorts extends AlertClosingPorts {
  registers: WatchedRegisterReader;
  branchHours: BranchHoursReader;
}

export async function detectQuietRegisters(ports: QuietRegisterDetectionPorts): Promise<number> {
  const now = ports.clock.now();
  const registers = await ports.registers.watchedRegisters();
  const hoursOfBranch = new Map<string, readonly BranchWeeklyHoursRange[]>();
  let quietCount = 0;
  for (const register of registers) {
    let hours = hoursOfBranch.get(register.locationId);
    if (hours === undefined) {
      hours = await ports.branchHours.branchHours(register.locationId);
      hoursOfBranch.set(register.locationId, hours);
    }
    if (isRegisterQuiet({ lastSuccessfulSyncAt: register.lastSuccessfulSyncAt, hours, now })) {
      await observeAlertCondition(ports, quietRegisterObservation(register));
      quietCount += 1;
    }
  }
  return quietCount;
}
