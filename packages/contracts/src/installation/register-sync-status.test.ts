import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { registerSyncStatusListSchema, registerSyncStatusSchema } from "./register-sync-status.js";

const synced = {
  id: "register-1",
  name: "Caja 1",
  last_successful_sync_at: "2026-03-02T09:30:00.000Z",
  battery: null,
  disk: null,
};
const neverSynced = { ...synced, id: "register-2", name: "Caja 2", last_successful_sync_at: null };
const onBattery = {
  present: true,
  charge_percent: 64,
  on_battery: true,
  on_battery_minutes: 14,
  health_percent: 55,
  worn: true,
};
const disk = { free_bytes: 105226698752, free_ratio: 0.41 };

describe("registerSyncStatusSchema", () => {
  it("accepts a register that synced and one that never did", () => {
    expect(registerSyncStatusSchema.safeParse(synced).data).toEqual(synced);
    expect(registerSyncStatusSchema.safeParse(neverSynced).data).toEqual(neverSynced);
  });

  it("strips keys it does not define", () => {
    expect(registerSyncStatusSchema.safeParse({ ...synced, app_version: "1.4.0" }).data).toEqual(
      synced,
    );
  });

  it("accepts a battery that is present, with or without a reported health, and one that is absent", () => {
    const { health_percent: _health, ...withoutHealth } = onBattery;

    for (const battery of [onBattery, { ...withoutHealth, worn: false }, { present: false }]) {
      expect(registerSyncStatusSchema.safeParse({ ...synced, battery }).data?.battery).toEqual(
        battery,
      );
    }
  });

  it("accepts a disk with its free size and ratio", () => {
    expect(registerSyncStatusSchema.safeParse({ ...synced, disk }).data?.disk).toEqual(disk);
  });

  it.each(["battery", "disk"])("requires %s, null when never reported", (field) => {
    const { [field as "battery" | "disk"]: _omitted, ...rest } = synced;

    expect(registerSyncStatusSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["a battery missing its charge", { ...onBattery, charge_percent: undefined }],
    ["a battery missing whether it is worn", { ...onBattery, worn: undefined }],
    ["a battery missing whether it is on battery", { ...onBattery, on_battery: undefined }],
    ["a battery missing its minutes on battery", { ...onBattery, on_battery_minutes: undefined }],
    ["a charge above 100", { ...onBattery, charge_percent: 101 }],
    ["a negative charge", { ...onBattery, charge_percent: -1 }],
    ["a fractional charge", { ...onBattery, charge_percent: 64.5 }],
    ["negative minutes on battery", { ...onBattery, on_battery_minutes: -1 }],
    ["a negative health", { ...onBattery, health_percent: -1 }],
    ["a health that is not whole", { ...onBattery, health_percent: 55.5 }],
    ["a battery with no presence", { charge_percent: 64 }],
  ])("refuses %s", (_name, battery) => {
    expect(registerSyncStatusSchema.safeParse({ ...synced, battery }).success).toBe(false);
  });

  it.each([
    ["a disk missing its free size", { ...disk, free_bytes: undefined }],
    ["a disk missing its ratio", { ...disk, free_ratio: undefined }],
    ["a negative free size", { ...disk, free_bytes: -1 }],
    ["a ratio above 1", { ...disk, free_ratio: 1.01 }],
    ["a negative ratio", { ...disk, free_ratio: -0.01 }],
  ])("refuses %s", (_name, badDisk) => {
    expect(registerSyncStatusSchema.safeParse({ ...synced, disk: badDisk }).success).toBe(false);
  });

  it.each(["id", "name", "last_successful_sync_at"])("requires %s", (field) => {
    const { [field as keyof typeof synced]: _omitted, ...rest } = synced;

    expect(registerSyncStatusSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["id", 1],
    ["id", null],
    ["name", 1],
    ["name", null],
    ["last_successful_sync_at", 1],
    ["last_successful_sync_at", undefined],
  ])("refuses %s as %j", (field, value) => {
    expect(registerSyncStatusSchema.safeParse({ ...synced, [field]: value }).success).toBe(false);
  });

  it("declares the zone the last successful sync is shown in", () => {
    expect(registerSyncStatusSchema.shape.last_successful_sync_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });
});

describe("registerSyncStatusListSchema", () => {
  it("accepts a list of registers, empty or not", () => {
    expect(registerSyncStatusListSchema.safeParse([]).data).toEqual([]);
    expect(registerSyncStatusListSchema.safeParse([synced, neverSynced]).data).toEqual([
      synced,
      neverSynced,
    ]);
  });

  it.each([undefined, null, {}, "registers", synced])("refuses %j as a list", (body) => {
    expect(registerSyncStatusListSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a list holding a malformed register", () => {
    expect(
      registerSyncStatusListSchema.safeParse([synced, { ...neverSynced, name: 2 }]).success,
    ).toBe(false);
  });
});
