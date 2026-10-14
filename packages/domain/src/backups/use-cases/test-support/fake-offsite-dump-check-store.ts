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
      latestVerifiedSizeBefore: async (night) => {
        const earlier = [...working.entries()]
          .filter(
            ([recordedNight, result]) => recordedNight < night && result.status === "verified",
          )
          .sort(([a], [b]) => (a < b ? 1 : -1))[0];
        return earlier?.[1].status === "verified" ? earlier[1].sizeBytes : undefined;
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
