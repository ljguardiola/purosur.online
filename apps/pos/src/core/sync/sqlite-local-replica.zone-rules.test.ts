import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";
import { openAdoptedReplica, savePulledChanges } from "./test-support/sqlite-local-replica";

const RULES_ID = "ac6e2d38-ebfd-4bb0-9cf3-7e9f1b3d5a6a";
const LATER_RULES_ID = "bd7f3e49-fc0e-4cc1-8d04-8fa02c4e6b7b";

const TRANSITIONS = [
  { from: "1970-01-01T00:00:00.000Z", offset_minutes: -180 },
  { from: "2030-03-01T03:00:00.000Z", offset_minutes: -120 },
];

function rulesChange(
  changeSeq: number,
  entityId: string,
  version: string,
  publishedAt: string,
  transitions: typeof TRANSITIONS = TRANSITIONS,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "zone_rules",
    entity_id: entityId,
    row: { version, transitions, published_at: publishedAt },
  };
  return { changeSeq, change };
}

function savedRules(database: LocalDatabase) {
  return database
    .prepare<[], { version: string; transitions: string; published_at: string }>(
      "SELECT version, transitions, published_at FROM zone_rules ORDER BY published_at",
    )
    .all()
    .map(({ transitions, ...rules }) => ({
      ...rules,
      transitions: JSON.parse(transitions) as unknown,
    }));
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
});

afterEach(() => {
  database.close();
});

describe("the register's local copy of the zone rules", () => {
  it("saves the rules of a version with their transitions and the moment they were published", async () => {
    await savePulledChanges(replica, rulesChange(1, RULES_ID, "2026a", "2026-10-26T12:00:00.000Z"));

    expect(savedRules(database)).toEqual([
      { version: "2026a", transitions: TRANSITIONS, published_at: "2026-10-26T12:00:00.000Z" },
    ]);
  });

  it("keeps every version it receives, an older one that arrives late included", async () => {
    await savePulledChanges(
      replica,
      rulesChange(1, LATER_RULES_ID, "2026a", "2026-10-26T12:00:00.000Z"),
    );

    await savePulledChanges(replica, rulesChange(2, RULES_ID, "2025c", "2026-01-01T00:00:00.000Z"));

    expect(savedRules(database).map((rules) => rules.version)).toEqual(["2025c", "2026a"]);
  });

  it("changes nothing when a version is delivered again", async () => {
    await savePulledChanges(replica, rulesChange(1, RULES_ID, "2026a", "2026-10-26T12:00:00.000Z"));

    await savePulledChanges(
      replica,
      rulesChange(2, RULES_ID, "2026a", "2026-10-27T12:00:00.000Z", TRANSITIONS.slice(0, 1)),
    );

    expect(savedRules(database)).toEqual([
      { version: "2026a", transitions: TRANSITIONS, published_at: "2026-10-26T12:00:00.000Z" },
    ]);
  });

  it("saves the cursor together with the rules", async () => {
    await savePulledChanges(replica, rulesChange(6, RULES_ID, "2026a", "2026-10-26T12:00:00.000Z"));

    expect(await replica.savedCursor()).toBe(6);
  });
});

describe("the register hearing of the zone rules it saved", () => {
  function replicaHearing(onZoneRulesSaved: () => void) {
    const heard = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
    const hearing = new SqliteLocalReplica(heard, onZoneRulesSaved);
    hearing.adoptDevice({ deviceId: "device-a", pepper: "pepper" });
    return { heard, hearing };
  }

  it("announces them once the page that carried them is saved", async () => {
    const onZoneRulesSaved = vi.fn();
    const { heard, hearing } = replicaHearing(onZoneRulesSaved);

    await savePulledChanges(hearing, rulesChange(1, RULES_ID, "2026a", "2026-10-26T12:00:00.000Z"));

    expect(onZoneRulesSaved).toHaveBeenCalledTimes(1);
    heard.close();
  });

  it("announces nothing for a page that carried none", async () => {
    const onZoneRulesSaved = vi.fn();
    const { heard, hearing } = replicaHearing(onZoneRulesSaved);

    await savePulledChanges(hearing);

    expect(onZoneRulesSaved).not.toHaveBeenCalled();
    heard.close();
  });

  it("announces the ones a redelivery carried", async () => {
    const onZoneRulesSaved = vi.fn();
    const { heard, hearing } = replicaHearing(onZoneRulesSaved);

    await hearing.saveRedeliveredPage("zone_rules", {
      changes: [rulesChange(1, RULES_ID, "2026a", "2026-10-26T12:00:00.000Z")],
      cursor: 1,
      hasMore: false,
    });

    expect(onZoneRulesSaved).toHaveBeenCalledTimes(1);
    heard.close();
  });
});
