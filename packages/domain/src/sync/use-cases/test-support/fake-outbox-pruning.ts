import type { OutboxPruning } from "../sync-ports.js";

export interface FakeHeldOutboxEvent {
  deviceSeq: number;
  acknowledgedAt: Date | null;
}

export class FakeOutboxPruning implements OutboxPruning {
  held: FakeHeldOutboxEvent[];
  cutoffsAsked: Date[] = [];
  failWith: Error | undefined;

  constructor(held: FakeHeldOutboxEvent[]) {
    this.held = [...held];
  }

  get heldSeqs(): number[] {
    return this.held.map((event) => event.deviceSeq);
  }

  async forgetAcknowledgedBefore(cutoff: Date): Promise<number> {
    this.cutoffsAsked.push(cutoff);
    if (this.failWith !== undefined) {
      throw this.failWith;
    }
    const before = this.held.length;
    this.held = this.held.filter(
      (event) => event.acknowledgedAt === null || event.acknowledgedAt >= cutoff,
    );
    return before - this.held.length;
  }
}
