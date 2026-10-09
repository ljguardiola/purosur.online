import type { Clock } from "../../shared/index.js";

export interface AcceptedPushLog {
  recordAcceptedPush(at: Date): Promise<void>;
}

export interface RecordAcceptedPushPorts {
  log: AcceptedPushLog;
  clock: Clock;
}

export async function recordAcceptedPush({ log, clock }: RecordAcceptedPushPorts): Promise<void> {
  await log.recordAcceptedPush(clock.now());
}
