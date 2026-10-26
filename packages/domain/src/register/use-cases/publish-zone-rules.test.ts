import { describe, expect, it } from "vitest";
import { publishZoneRules } from "./publish-zone-rules.js";
import { FakeZoneRulesStore } from "./test-support/fake-zone-rules-store.js";

const NOW = new Date("2026-10-26T12:00:00Z");
const clock = { now: () => NOW };
const TRANSITIONS = [{ from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: -180 }];

describe("publishZoneRules", () => {
  it("publishes the rules of a version the cloud has not published yet, stamped with the moment of publication", async () => {
    const store = new FakeZoneRulesStore();

    const outcome = await publishZoneRules(
      { store, clock },
      { version: "2026a", transitions: TRANSITIONS },
    );

    expect(outcome).toEqual({ kind: "published", version: "2026a" });
    expect(store.snapshot()).toEqual([
      { version: "2026a", transitions: TRANSITIONS, publishedAt: NOW },
    ]);
  });

  it("keeps the versions published before when it publishes another", async () => {
    const store = new FakeZoneRulesStore();
    const earlier = new Date("2026-01-01T00:00:00Z");
    store.seed({ version: "2025c", transitions: TRANSITIONS, publishedAt: earlier });

    await publishZoneRules({ store, clock }, { version: "2026a", transitions: TRANSITIONS });

    expect(store.snapshot().map((rules) => rules.version)).toEqual(["2025c", "2026a"]);
  });

  it("publishes nothing again for a version already published", async () => {
    const store = new FakeZoneRulesStore();
    const earlier = new Date("2026-01-01T00:00:00Z");
    store.seed({ version: "2026a", transitions: TRANSITIONS, publishedAt: earlier });

    const outcome = await publishZoneRules(
      { store, clock },
      { version: "2026a", transitions: [{ from: new Date(0), offsetMinutes: -120 }] },
    );

    expect(outcome).toEqual({ kind: "already_published", version: "2026a" });
    expect(store.snapshot()).toEqual([
      { version: "2026a", transitions: TRANSITIONS, publishedAt: earlier },
    ]);
  });

  it("takes the publication lock before it looks at what is published", async () => {
    const store = new FakeZoneRulesStore();

    await publishZoneRules({ store, clock }, { version: "2026a", transitions: TRANSITIONS });

    expect(store.operationOrder).toEqual([
      "lockZoneRulesPublication",
      "isZoneRulesVersionPublished",
      "publishZoneRules",
    ]);
  });
});
