import type { RestorationEvidence } from "../../../register/index.js";
import type {
  AwaitedContingencyTicketRecovery,
  ContingencyTicketRecoveryPredecessor,
  ContingencyTicketRecoveryRequester,
  ContingencyTicketRecoveryStatus,
  RestorationEvidenceReader,
} from "../await-contingency-ticket-recovery-ports.js";

export const COMPLETED_RESTORATION: RestorationEvidence = {
  enroll: "completed",
  restore: "completed",
  reset_sync_identity: "completed",
  replenish: "completed",
  recover_contingency_tickets: "completed",
  reconcile_fiscal_counters: "completed",
  regularize_orphan_authorizations: "completed",
  origin: "copy",
  cloud: "reachable",
};

export class FakeRestorationEvidenceReader implements RestorationEvidenceReader {
  private readonly held: RestorationEvidence;

  constructor(held: RestorationEvidence) {
    this.held = held;
  }

  evidence(): RestorationEvidence {
    return this.held;
  }
}

export class FakeContingencyTicketRecoveryRequester
  implements ContingencyTicketRecoveryRequester<string>
{
  readonly asked: string[] = [];
  private readonly status: ContingencyTicketRecoveryStatus<string>;

  constructor(status: ContingencyTicketRecoveryStatus<string> = { kind: "finished" }) {
    this.status = status;
  }

  async ask(predecessorDeviceId: string): Promise<ContingencyTicketRecoveryStatus<string>> {
    this.asked.push(predecessorDeviceId);
    return this.status;
  }
}

export class FakeAwaitedContingencyTicketRecovery implements AwaitedContingencyTicketRecovery {
  readonly released: ContingencyTicketRecoveryPredecessor[] = [];
  private awaited: ContingencyTicketRecoveryPredecessor | undefined;

  constructor(awaited?: ContingencyTicketRecoveryPredecessor) {
    this.awaited = awaited;
  }

  async predecessor(): Promise<ContingencyTicketRecoveryPredecessor | undefined> {
    return this.awaited;
  }

  async release(predecessor: ContingencyTicketRecoveryPredecessor): Promise<void> {
    this.released.push(predecessor);
    this.awaited = undefined;
  }
}
