import type { BranchWeeklyHoursRange } from "../../branch/index.js";

export interface InServiceRegister {
  registerId: string;
  deviceId: string;
  locationId: string;
  enrolledAt: Date;
  lastAcceptedPushAt: Date | null;
  hours: readonly BranchWeeklyHoursRange[];
}

export interface InServiceRegisterReader {
  // An installation the cloud revoked is out of service: a register with no other installation
  // is not listed.
  inServiceRegisters(): Promise<InServiceRegister[]>;
}
