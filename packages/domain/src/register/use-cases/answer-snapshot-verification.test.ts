import { describe, expect, it } from "vitest";
import { answerSnapshotVerification } from "./answer-snapshot-verification.js";
import { FakeSnapshotStore } from "./test-support/fake-snapshot-store.js";

describe("answerSnapshotVerification", () => {
  it("answers which of the asked generations of the register the cloud verified, pruned or not", async () => {
    const store = new FakeSnapshotStore();
    store.seedGeneration({ id: "verified", status: "verified" });
    store.seedGeneration({ id: "verified-then-pruned", status: "verified", pruned: true });
    store.seedGeneration({ id: "declared", status: "declared" });
    store.seedGeneration({ id: "uploaded", status: "uploaded" });
    store.seedGeneration({ id: "failed", status: "failed", pruned: true });
    store.seedGeneration({ id: "not-asked", status: "verified" });
    store.seedGeneration({ id: "foreign", status: "verified", registerId: "register-other" });

    const verified = await answerSnapshotVerification(
      { store },
      {
        registerId: "register-1",
        generationIds: [
          "verified",
          "verified-then-pruned",
          "declared",
          "uploaded",
          "failed",
          "foreign",
          "unknown",
        ],
      },
    );

    expect(verified.sort()).toEqual(["verified", "verified-then-pruned"]);
    expect(store.operationOrder).toEqual(["generationsAmong"]);
  });

  it("answers nothing verified when asked about no generation", async () => {
    const store = new FakeSnapshotStore();
    store.seedGeneration({ id: "verified", status: "verified" });

    expect(
      await answerSnapshotVerification({ store }, { registerId: "register-1", generationIds: [] }),
    ).toEqual([]);
  });
});
