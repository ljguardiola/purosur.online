import { describe, expect, it } from "vitest";
import { publishZoneRules } from "./publish-zone-rules.js";
import { FakeZoneRulesStore } from "./test-support/fake-zone-rules-store.js";

const TRANSITIONS = [{ from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: -180 }];

describe("publishZoneRules", () => {
  it("publishes the rules of a version the cloud has not published yet, as its first publication", async () => {
    const store = new FakeZoneRulesStore();

    const outcome = await publishZoneRules(
      { store },
      { version: "2026a", transitions: TRANSITIONS },
    );

    expect(outcome).toEqual({ kind: "published", version: "2026a" });
    expect(store.snapshot()).toEqual([
      { version: "2026a", transitions: TRANSITIONS, publicationNumber: 1 },
    ]);
  });

  it("numbers a new version after the one published last, keeping the versions published before", async () => {
    const store = new FakeZoneRulesStore();
    store.seed({ version: "2026b", transitions: TRANSITIONS, publicationNumber: 1 });
    store.seed({ version: "2025c", transitions: TRANSITIONS, publicationNumber: 2 });

    await publishZoneRules({ store }, { version: "2026a", transitions: TRANSITIONS });

    expect(
      store.snapshot().map(({ version, publicationNumber }) => ({ version, publicationNumber })),
    ).toEqual([
      { version: "2026b", publicationNumber: 1 },
      { version: "2025c", publicationNumber: 2 },
      { version: "2026a", publicationNumber: 3 },
    ]);
  });

  it("publishes nothing again for a version already published", async () => {
    const store = new FakeZoneRulesStore();
    store.seed({ version: "2026a", transitions: TRANSITIONS, publicationNumber: 1 });

    const outcome = await publishZoneRules(
      { store },
      { version: "2026a", transitions: [{ from: new Date(0), offsetMinutes: -120 }] },
    );

    expect(outcome).toEqual({ kind: "already_published", version: "2026a" });
    expect(store.snapshot()).toEqual([
      { version: "2026a", transitions: TRANSITIONS, publicationNumber: 1 },
    ]);
  });

  it("takes the publication lock before it looks at what is published", async () => {
    const store = new FakeZoneRulesStore();

    await publishZoneRules({ store }, { version: "2026a", transitions: TRANSITIONS });

    expect(store.operationOrder).toEqual([
      "lockZoneRulesPublication",
      "zoneRulesPublications",
      "publishZoneRules",
    ]);
  });
});
