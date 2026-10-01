import type {
  PullAudience,
  PulledEntity,
  PullingRegister,
  PullReach,
} from "../../model/pull-audience.js";
import type { ChangeLog, ChangeLogTransaction, PulledChange } from "../sync-ports.js";

export interface FakeLoggedChange extends PulledChange {
  entity: PulledEntity;
  entityId: string;
  locationId?: string;
  priceListId?: string;
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

function reaches(reach: PullReach, change: FakeLoggedChange): boolean {
  switch (reach.kind) {
    case "every_row":
      return true;
    case "row":
      return change.entityId === reach.id;
    case "rows_of_branch":
      return change.locationId === reach.locationId;
    case "rows_of_price_list":
      return change.priceListId === reach.priceListId;
    case "none":
      return false;
  }
}

export class FakeChangeLog implements ChangeLog<FakeLoggedChange> {
  state: FakeChangeLogState;
  readRequests: { audience: PullAudience; since: number; limit: number }[] = [];
  failReading = false;
  private readonly installedRegisters: Readonly<Record<string, PullingRegister>>;

  constructor(
    changes: FakeLoggedChange[] = [],
    installedRegisters: Readonly<Record<string, PullingRegister>> = {},
  ) {
    this.state = { changes, observedPulls: [] };
    this.installedRegisters = installedRegisters;
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
      pullingRegister: async (deviceId) => {
        const register = this.installedRegisters[deviceId];
        if (register === undefined) {
          throw new Error("the device is installed in no register");
        }
        return register;
      },
      changesAfter: async (audience, since, limit) => {
        this.readRequests.push({ audience, since, limit });
        if (this.failReading) {
          throw new Error("the change log could not be read");
        }
        return working.changes
          .filter((change) => reaches(audience[change.entity], change) && change.changeSeq > since)
          .sort((a, b) => a.changeSeq - b.changeSeq)
          .slice(0, limit);
      },
    });
    this.state = working;
    return outcome;
  }
}
