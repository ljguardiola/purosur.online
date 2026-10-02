import { describe, expect, it } from "vitest";
import { recordRegistrationChallenge } from "./record-registration-challenge.js";
import { FakeRecoveryRedemptionStore } from "./test-support/fake-recovery-redemption-store.js";

describe("recordRegistrationChallenge", () => {
  it("records the challenge issued for the token", async () => {
    const store = new FakeRecoveryRedemptionStore();

    await recordRegistrationChallenge({ store }, { tokenId: "token-1", challenge: "challenge-1" });

    expect(store.snapshot().challenges).toEqual([{ tokenId: "token-1", challenge: "challenge-1" }]);
  });
});
