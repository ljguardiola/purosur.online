import type { BranchSettingsBody } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const LOCATION_ID = "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10";

function settingsRow(overrides: Partial<BranchSettingsBody> = {}): BranchSettingsBody {
  return {
    address: "Av. Belgrano 1450, CABA",
    whatsapp_number: "+54 9 11 3333-2211",
    instagram_handle: "@purosur.dietetica",
    monday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
    tuesday_hours: [],
    wednesday_hours: [],
    thursday_hours: [],
    friday_hours: [],
    saturday_hours: [],
    sunday_hours: [{ opens_at: "10:00", closes_at: "14:00" }],
    expiring_lot_alert_days: 30,
    unreviewed_price_alert_days: 30,
    good_condition_return_days: 15,
    version: 2,
    ...overrides,
  };
}

function branchSettingsChange(changeSeq: number, row: BranchSettingsBody): RegisterPulledChange {
  return {
    changeSeq,
    change: { change_seq: changeSeq, entity: "branch_settings", entity_id: LOCATION_ID, row },
  };
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  replica = new SqliteLocalReplica(database);
});

afterEach(() => {
  database.close();
});

function storedBranchSettings() {
  return replica.branchSettings(LOCATION_ID);
}

describe("the register's local copy of what it pulls", () => {
  it("starts a brand-new installation at the very first cursor, holding no branch settings", async () => {
    expect(await replica.savedCursor()).toBe(0);
    expect(storedBranchSettings()).toBeUndefined();
  });

  it("saves a page's branch settings together with the page's cursor", async () => {
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow())],
      cursor: 7,
      hasMore: false,
    });

    expect(await replica.savedCursor()).toBe(7);
    expect(storedBranchSettings()).toEqual(settingsRow());
  });

  it("keeps the newer version when an older or the same one arrives again, still moving the cursor", async () => {
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow({ version: 3, address: "Nueva" }))],
      cursor: 7,
      hasMore: false,
    });

    await replica.savePage({
      changes: [
        branchSettingsChange(8, settingsRow({ version: 2, address: "Vieja" })),
        branchSettingsChange(9, settingsRow({ version: 3, address: "Otra" })),
      ],
      cursor: 9,
      hasMore: false,
    });

    expect(storedBranchSettings()).toMatchObject({ version: 3, address: "Nueva" });
    expect(await replica.savedCursor()).toBe(9);
  });

  it("replaces the settings with a newer version", async () => {
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow())],
      cursor: 7,
      hasMore: false,
    });

    await replica.savePage({
      changes: [branchSettingsChange(8, settingsRow({ version: 3, sunday_hours: [] }))],
      cursor: 8,
      hasMore: false,
    });

    expect(storedBranchSettings()).toEqual(settingsRow({ version: 3, sunday_hours: [] }));
  });

  it("saves neither the data nor the cursor when the page can't be saved whole", async () => {
    database.exec(
      "CREATE TRIGGER refuse_cursor BEFORE UPDATE ON pull_cursor BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );

    await expect(
      replica.savePage({
        changes: [branchSettingsChange(7, settingsRow())],
        cursor: 7,
        hasMore: false,
      }),
    ).rejects.toThrow("disk full");

    expect(await replica.savedCursor()).toBe(0);
    expect(storedBranchSettings()).toBeUndefined();
  });
});
