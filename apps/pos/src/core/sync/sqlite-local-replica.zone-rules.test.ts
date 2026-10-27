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
const REPUBLISHED_RULES_ID = "ce804f5a-0d1f-4dd2-9e15-90b13d5f7c8c";

const TRANSITIONS = [
  { from: "1970-01-01T00:00:00.000Z", offset_minutes: -180 },
  { from: "2030-03-01T03:00:00.000Z", offset_minutes: -120 },
];

function rulesChange(
  changeSeq: number,
  entityId: string,
  version: string,
  publicationNumber: number,
  transitions: typeof TRANSITIONS = TRANSITIONS,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "zone_rules",
    entity_id: entityId,
    row: { version, transitions, publication_number: publicationNumber },
  };
  return { changeSeq, change };
}

function savedRules(database: LocalDatabase) {
  return database
    .prepare<[], { version: string; transitions: string; publication_number: number }>(
      "SELECT version, transitions, publication_number FROM zone_rules ORDER BY publication_number",
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
  it("saves the rules of a version with their transitions and their publication number", async () => {
    await savePulledChanges(replica, rulesChange(1, RULES_ID, "2026a", 2));

    expect(savedRules(database)).toEqual([
      { version: "2026a", transitions: TRANSITIONS, publication_number: 2 },
    ]);
  });

  it("keeps every version it receives, one published earlier that arrives late included", async () => {
    await savePulledChanges(replica, rulesChange(1, LATER_RULES_ID, "2026a", 2));

    await savePulledChanges(replica, rulesChange(2, RULES_ID, "2025c", 1));

    expect(savedRules(database).map((rules) => rules.version)).toEqual(["2025c", "2026a"]);
  });

  it("keeps a version the cloud published again after a later one as its own publication", async () => {
    await savePulledChanges(replica, rulesChange(1, RULES_ID, "2026a", 1));
    await savePulledChanges(replica, rulesChange(2, LATER_RULES_ID, "2026b", 2));

    await savePulledChanges(replica, rulesChange(3, REPUBLISHED_RULES_ID, "2026a", 3));

    expect(
      savedRules(database).map(({ version, publication_number }) => ({
        version,
        publication_number,
      })),
    ).toEqual([
      { version: "2026a", publication_number: 1 },
      { version: "2026b", publication_number: 2 },
      { version: "2026a", publication_number: 3 },
    ]);
  });

  it("changes nothing when a publication is delivered again", async () => {
    await savePulledChanges(replica, rulesChange(1, RULES_ID, "2026a", 2));

    await savePulledChanges(replica, rulesChange(2, RULES_ID, "2026a", 2, TRANSITIONS.slice(0, 1)));

    expect(savedRules(database)).toEqual([
      { version: "2026a", transitions: TRANSITIONS, publication_number: 2 },
    ]);
  });

  it("saves the cursor together with the rules", async () => {
    await savePulledChanges(replica, rulesChange(6, RULES_ID, "2026a", 2));

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

    await savePulledChanges(hearing, rulesChange(1, RULES_ID, "2026a", 2));

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
      changes: [rulesChange(1, RULES_ID, "2026a", 2)],
      cursor: 1,
      hasMore: false,
    });

    expect(onZoneRulesSaved).toHaveBeenCalledTimes(1);
    heard.close();
  });
});
