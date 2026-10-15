import type { OffsiteDumpCheckResult } from "../../model/offsite-dump-check.js";
import type {
  OffsiteDumpCheckStore,
  OffsiteDumpCheckStoreTransaction,
} from "../offsite-dump-check-store.js";

export class FakeOffsiteDumpCheckStore implements OffsiteDumpCheckStore {
  private results: Map<string, OffsiteDumpCheckResult>;
  failNextRecording = false;

  constructor(seeded: Record<string, OffsiteDumpCheckResult> = {}) {
    this.results = new Map(Object.entries(structuredClone(seeded)));
  }

  snapshot(): Record<string, OffsiteDumpCheckResult> {
    return structuredClone(Object.fromEntries(this.results));
  }

  async transaction<TOutcome>(
    work: (tx: OffsiteDumpCheckStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const working = new Map(this.results);
    const tx: OffsiteDumpCheckStoreTransaction = {
      latestKnownSizeBefore: async (night) => {
        const sizes = [...working.entries()]
          .filter(([recordedNight]) => recordedNight < night)
          .sort(([a], [b]) => (a < b ? 1 : -1))
          .flatMap(([, result]) => ("sizeBytes" in result ? [result.sizeBytes] : []));
        return sizes[0];
      },
      recordResult: async (night, result) => {
        if (this.failNextRecording) {
          this.failNextRecording = false;
          throw new Error("storage unavailable");
        }
        working.set(night, structuredClone(result));
      },
    };
    const outcome = await work(tx);
    this.results = working;
    return outcome;
  }
}
