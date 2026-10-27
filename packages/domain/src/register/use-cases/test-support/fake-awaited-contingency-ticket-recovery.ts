import type {
  AwaitedContingencyTicketRecovery,
  ContingencyTicketRecoveryPredecessor,
  ContingencyTicketRecoveryRequester,
  ContingencyTicketRecoveryStatus,
} from "../await-contingency-ticket-recovery-ports.js";

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
