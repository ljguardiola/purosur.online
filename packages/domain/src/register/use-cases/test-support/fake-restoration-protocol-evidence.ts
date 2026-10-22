import type { RestorationEvidence } from "../../model/restoration-protocol.js";
import type { RestorationProtocolEvidence } from "../restoration-protocol-evidence.js";

export const COMPLETED_RESTORATION: RestorationEvidence = {
  enroll: "completed",
  restore: "completed",
  reset_sync_identity: "completed",
  replenish: "completed",
  reconcile_fiscal_counters: "completed",
  cloud: "unknown",
};

export class FakeRestorationProtocolEvidence implements RestorationProtocolEvidence {
  reads = 0;
  private readonly answer: RestorationEvidence;

  constructor(answer: RestorationEvidence = COMPLETED_RESTORATION) {
    this.answer = answer;
  }

  evidence(): RestorationEvidence {
    this.reads += 1;
    return this.answer;
  }
}
