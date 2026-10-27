import { FIXED_ARGENTINA_ZONE_RULES, offsetAt } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "./local-database";
import { LOCAL_MIGRATIONS } from "./local-migrations";
import { migrationClock } from "./test-support/migration-clock";
import { openLocalDatabase } from "./test-support/open-local-database";
import { ZoneRulesHolder } from "./zone-rules-holder";

let database: LocalDatabase;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

function store(version: string, publicationNumber: number, offsetAfterMarch2030: number) {
  database
    .prepare("INSERT INTO zone_rules (version, transitions, publication_number) VALUES (?, ?, ?)")
    .run(
      version,
      JSON.stringify([
        { from: "1970-01-01T00:00:00.000Z", offset_minutes: -180 },
        { from: "2030-03-01T03:00:00.000Z", offset_minutes: offsetAfterMarch2030 },
      ]),
      publicationNumber,
    );
}

describe("the zone rules the register applies", () => {
  it("are the fixed Argentina rules, of no version, before any delivery", () => {
    const holder = new ZoneRulesHolder(database);

    expect(holder.current()).toEqual(FIXED_ARGENTINA_ZONE_RULES);
    expect(holder.current().version).toBeNull();
  });

  it("are the version the cloud published last among the ones stored, as of its start", () => {
    store("2025c", 2, -120);
    store("2026a", 1, -60);

    const rules = new ZoneRulesHolder(database).current();

    expect(rules.version).toBe("2025c");
    expect(rules.transitions).toEqual([
      { from: new Date("1970-01-01T00:00:00.000Z"), offsetMinutes: -180 },
      { from: new Date("2030-03-01T03:00:00.000Z"), offsetMinutes: -120 },
    ]);
    expect(offsetAt(rules, new Date("2031-01-01T00:00:00Z"))).toBe(-120);
  });

  it("stay the ones read at start until the holder is told a delivery was saved", () => {
    const holder = new ZoneRulesHolder(database);
    store("2026a", 1, -120);

    expect(holder.current().version).toBeNull();

    holder.refresh();

    expect(holder.current().version).toBe("2026a");
  });

  it("are a version the cloud published again after a later one, once that publication is saved", () => {
    store("2026a", 1, -60);
    store("2026b", 2, -120);
    const holder = new ZoneRulesHolder(database);

    store("2026a", 3, -60);
    holder.refresh();

    expect(holder.current().version).toBe("2026a");
  });

  it("do not go back to a version published earlier that is delivered after a later one", () => {
    store("2026a", 2, -120);
    const holder = new ZoneRulesHolder(database);

    store("2025c", 1, -60);
    holder.refresh();

    expect(holder.current().version).toBe("2026a");
  });
});
