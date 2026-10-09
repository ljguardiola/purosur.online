import { describe, expect, it } from "vitest";
import { replacePin } from "./replace-pin.js";
import { pinReplacementFixture } from "./test-support/fake-pin-replacement-store.js";

function fixture() {
  const created = pinReplacementFixture();
  created.store.seedCredential("person-1", "old-credential");
  created.store.seedFailures("person-1", 3);
  created.store.seedCredential("person-2", "old-credential");
  created.store.seedFailures("person-2", 2);
  return created;
}

describe("replacePin", () => {
  it("saves the new credential and clears the failures of a person whose PIN changed", () => {
    const created = fixture();

    replacePin(created.ports, { userId: "person-1", credential: "new-credential" });

    expect(created.store.credentials.get("person-1")).toBe("new-credential");
    expect(created.store.failureCounts.has("person-1")).toBe(false);
  });

  it("keeps the failures of a person whose PIN stays the same", () => {
    const created = fixture();

    replacePin(created.ports, { userId: "person-1", credential: "old-credential" });

    expect(created.store.failureCounts.get("person-1")).toBe(3);
  });

  it("clears the failures of a person who had no PIN before", () => {
    const created = pinReplacementFixture();
    created.store.seedFailures("person-1", 3);

    replacePin(created.ports, { userId: "person-1", credential: "new-credential" });

    expect(created.store.credentials.get("person-1")).toBe("new-credential");
    expect(created.store.failureCounts.has("person-1")).toBe(false);
  });

  it("removes the credential and clears the failures of a person whose PIN is removed", () => {
    const created = fixture();

    replacePin(created.ports, { userId: "person-1", credential: undefined });

    expect(created.store.credentials.has("person-1")).toBe(false);
    expect(created.store.failureCounts.has("person-1")).toBe(false);
  });

  it("clears the failures of a person with no PIN whose PIN is removed again", () => {
    const created = pinReplacementFixture();
    created.store.seedFailures("person-1", 3);

    replacePin(created.ports, { userId: "person-1", credential: undefined });

    expect(created.store.failureCounts.has("person-1")).toBe(false);
  });

  it("leaves the failures of another person alone", () => {
    const created = fixture();

    replacePin(created.ports, { userId: "person-1", credential: "new-credential" });

    expect(created.store.failureCounts.get("person-2")).toBe(2);
  });
});
