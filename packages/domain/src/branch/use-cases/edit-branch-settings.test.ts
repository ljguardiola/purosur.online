import { describe, expect, it } from "vitest";
import type { BranchSettings } from "./branch-settings-store.js";
import { type EditBranchSettingsInput, editBranchSettings } from "./edit-branch-settings.js";
import { FakeBranchSettingsStore } from "./test-support/fake-branch-settings-store.js";

const LOCATION = "location-1";

const saved: BranchSettings = {
  address: "Av. Siempre Viva 742",
  whatsappNumber: "+54 11 5555-0000",
  instagramHandle: "@comercio.de.prueba",
  hours: [
    { dayOfWeek: 1, position: 0, opensAt: "09:00", closesAt: "13:00" },
    { dayOfWeek: 1, position: 1, opensAt: "17:00", closesAt: "21:00" },
    { dayOfWeek: 6, position: 0, opensAt: "09:00", closesAt: "13:00" },
  ],
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 20,
  goodConditionReturnDays: 15,
  version: 3,
};

const sameAsSaved: EditBranchSettingsInput = {
  locationId: LOCATION,
  actorId: "actor-1",
  address: "Av. Siempre Viva 742",
  whatsappNumber: "+54 11 5555-0000",
  instagramHandle: "@comercio.de.prueba",
  mondayHours: [
    { opensAt: "09:00", closesAt: "13:00" },
    { opensAt: "17:00", closesAt: "21:00" },
  ],
  tuesdayHours: [],
  wednesdayHours: [],
  thursdayHours: [],
  fridayHours: [],
  saturdayHours: [{ opensAt: "09:00", closesAt: "13:00" }],
  sundayHours: [],
  expiringLotAlertDays: 30,
  unreviewedPriceAlertDays: 20,
  goodConditionReturnDays: 15,
  version: 3,
};

function storeWithSaved(): FakeBranchSettingsStore {
  const store = new FakeBranchSettingsStore();
  store.seed(LOCATION, saved);
  return store;
}

function edit(store: FakeBranchSettingsStore, overrides: Partial<EditBranchSettingsInput> = {}) {
  return editBranchSettings({ store }, { ...sameAsSaved, ...overrides });
}

describe("editBranchSettings", () => {
  it("records the edit as the next version with its hours by day and position, and who saved it", async () => {
    const store = storeWithSaved();

    const outcome = await edit(store, {
      address: "Av. Nueva 100",
      tuesdayHours: [{ opensAt: "10:00", closesAt: "12:00" }],
      saturdayHours: [],
    });

    const next: BranchSettings = {
      ...saved,
      address: "Av. Nueva 100",
      hours: [
        { dayOfWeek: 1, position: 0, opensAt: "09:00", closesAt: "13:00" },
        { dayOfWeek: 1, position: 1, opensAt: "17:00", closesAt: "21:00" },
        { dayOfWeek: 2, position: 0, opensAt: "10:00", closesAt: "12:00" },
      ],
      version: 4,
    };
    expect(outcome).toEqual({ kind: "edited", settings: next });
    expect(store.snapshot()).toEqual({
      settings: { [LOCATION]: next },
      versions: [{ ...next, locationId: LOCATION, recordedBy: "actor-1", previous: saved }],
    });
  });

  it("refuses an edit made from another version, writing nothing", async () => {
    const store = storeWithSaved();
    const before = store.snapshot();

    const outcome = await edit(store, { version: 2, address: "Av. Nueva 100" });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockCurrentBranchSettings"]);
  });

  it("keeps the version and records nothing when every value is the one already saved", async () => {
    const store = storeWithSaved();
    const before = store.snapshot();

    const outcome = await edit(store);

    expect(outcome).toEqual({ kind: "unchanged", settings: saved });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockCurrentBranchSettings"]);
  });

  it.each<[string, Partial<EditBranchSettingsInput>]>([
    ["the address", { address: "Av. Otra 1" }],
    ["the WhatsApp number", { whatsappNumber: "+54 11 5555-0001" }],
    ["the Instagram handle", { instagramHandle: "@otro" }],
    ["the expiring lot alert days", { expiringLotAlertDays: 31 }],
    ["the unreviewed price alert days", { unreviewedPriceAlertDays: 21 }],
    ["the good condition return days", { goodConditionReturnDays: 16 }],
    ["a range's closing time", { saturdayHours: [{ opensAt: "09:00", closesAt: "14:00" }] }],
    ["a range's opening time", { saturdayHours: [{ opensAt: "08:00", closesAt: "13:00" }] }],
    ["a day's hours removed", { saturdayHours: [] }],
    [
      "a range added to a day",
      {
        sundayHours: [{ opensAt: "10:00", closesAt: "12:00" }],
      },
    ],
    [
      "the same ranges of a day in another order",
      {
        mondayHours: [
          { opensAt: "17:00", closesAt: "21:00" },
          { opensAt: "09:00", closesAt: "13:00" },
        ],
      },
    ],
    [
      "the same range moved to another day",
      { saturdayHours: [], sundayHours: [{ opensAt: "09:00", closesAt: "13:00" }] },
    ],
  ])("records a new version when only %s differs", async (_case, change) => {
    const store = storeWithSaved();

    const outcome = await edit(store, change);

    expect(outcome).toMatchObject({ kind: "edited", settings: { version: 4 } });
    expect(store.operationOrder).toEqual([
      "lockCurrentBranchSettings",
      "recordBranchSettingsVersion",
    ]);
  });

  it("locks the current settings before it records, in one transaction", async () => {
    const store = storeWithSaved();

    await edit(store, { address: "Av. Nueva 100" });

    expect(store.operationOrder).toEqual([
      "lockCurrentBranchSettings",
      "recordBranchSettingsVersion",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("leaves the settings as they were when recording the version fails", async () => {
    const store = storeWithSaved();
    store.failingWrites.add("recordBranchSettingsVersion");
    const before = store.snapshot();

    await expect(edit(store, { address: "Av. Nueva 100" })).rejects.toThrow(
      "recordBranchSettingsVersion failed",
    );

    expect(store.snapshot()).toEqual(before);
  });
});
