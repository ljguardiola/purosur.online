import type {
  BranchSettings,
  BranchSettingsStore,
  BranchSettingsStoreTransaction,
  NewBranchSettingsVersion,
} from "../branch-settings-store.js";

export type FakeBranchSettingsWrite = "recordBranchSettingsVersion";

export interface FakeBranchSettingsState {
  settings: Record<string, BranchSettings>;
  versions: (NewBranchSettingsVersion & { previous: BranchSettings })[];
}

function cloneSettings(settings: BranchSettings): BranchSettings {
  return { ...settings, hours: settings.hours.map((range) => ({ ...range })) };
}

function cloneState(state: FakeBranchSettingsState): FakeBranchSettingsState {
  return {
    settings: Object.fromEntries(
      Object.entries(state.settings).map(([locationId, settings]) => [
        locationId,
        cloneSettings(settings),
      ]),
    ),
    versions: state.versions.map((version) => ({
      ...cloneSettings(version),
      locationId: version.locationId,
      recordedBy: version.recordedBy,
      previous: cloneSettings(version.previous),
    })),
  };
}

class FakeTransaction implements BranchSettingsStoreTransaction {
  private readonly state: FakeBranchSettingsState;
  private readonly store: FakeBranchSettingsStore;

  constructor(state: FakeBranchSettingsState, store: FakeBranchSettingsStore) {
    this.state = state;
    this.store = store;
  }

  async lockCurrentBranchSettings(locationId: string): Promise<BranchSettings> {
    this.store.operationOrder.push("lockCurrentBranchSettings");
    const settings = this.state.settings[locationId];
    if (!settings) {
      throw new Error(`branch settings missing for location ${locationId}`);
    }
    return cloneSettings(settings);
  }

  async recordBranchSettingsVersion(
    next: NewBranchSettingsVersion,
    previous: BranchSettings,
  ): Promise<void> {
    this.store.operationOrder.push("recordBranchSettingsVersion");
    const { locationId, recordedBy: _recordedBy, ...settings } = next;
    this.state.settings[locationId] = cloneSettings(settings);
    this.state.versions.push({
      ...cloneSettings(next),
      locationId,
      recordedBy: next.recordedBy,
      previous: cloneSettings(previous),
    });
    if (this.store.failingWrites.has("recordBranchSettingsVersion")) {
      throw new Error("recordBranchSettingsVersion failed");
    }
  }
}

export class FakeBranchSettingsStore implements BranchSettingsStore {
  private state: FakeBranchSettingsState = { settings: {}, versions: [] };

  readonly failingWrites = new Set<FakeBranchSettingsWrite>();
  operationOrder: string[] = [];
  transactionCount = 0;

  seed(locationId: string, settings: BranchSettings): void {
    this.state.settings[locationId] = cloneSettings(settings);
  }

  snapshot(): FakeBranchSettingsState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: BranchSettingsStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakeTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
