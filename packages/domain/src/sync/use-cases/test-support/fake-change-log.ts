import type { ChangeLog, ChangeLogTransaction, PulledChange } from "../sync-ports.js";

export interface FakeLoggedChange extends PulledChange {
  locationId: string;
}

interface FakeObservedPull {
  deviceId: string;
  since: number;
  at: Date;
}

export interface FakeChangeLogState {
  changes: FakeLoggedChange[];
  observedPulls: FakeObservedPull[];
}

export class FakeChangeLog implements ChangeLog<FakeLoggedChange> {
  state: FakeChangeLogState;
  readRequests: { locationId: string; since: number; limit: number }[] = [];
  failReading = false;

  constructor(changes: FakeLoggedChange[] = []) {
    this.state = { changes, observedPulls: [] };
  }

  async transaction<TOutcome>(
    work: (tx: ChangeLogTransaction<FakeLoggedChange>) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const working = structuredClone(this.state);
    const outcome = await work({
      recordObservedPull: async (deviceId, since, at) => {
        working.observedPulls = working.observedPulls.filter((pull) => pull.deviceId !== deviceId);
        working.observedPulls.push({ deviceId, since, at });
      },
      changesAfter: async (locationId, since, limit) => {
        this.readRequests.push({ locationId, since, limit });
        if (this.failReading) {
          throw new Error("the change log could not be read");
        }
        return working.changes
          .filter((change) => change.locationId === locationId && change.changeSeq > since)
          .sort((a, b) => a.changeSeq - b.changeSeq)
          .slice(0, limit);
      },
    });
    this.state = working;
    return outcome;
  }
}
