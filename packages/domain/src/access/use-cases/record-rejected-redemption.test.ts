import { describe, expect, it } from "vitest";
import { recordRejectedRedemption } from "./record-rejected-redemption.js";
import { FakeRecoveryRedemptionStore } from "./test-support/fake-recovery-redemption-store.js";

describe("recordRejectedRedemption", () => {
  it("records which attempt on which token was rejected, and why", async () => {
    const store = new FakeRecoveryRedemptionStore();

    await recordRejectedRedemption(
      { store },
      { tokenId: "token-1", userId: "u-1", attempt: "redeem", rejectedWith: "validation_failed" },
    );

    expect(store.snapshot().rejectedRedemptions).toEqual([
      { tokenId: "token-1", userId: "u-1", attempt: "redeem", rejectedWith: "validation_failed" },
    ]);
  });
});
