import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { registerSyncStatusListSchema, registerSyncStatusSchema } from "./register-sync-status.js";

const synced = {
  id: "register-1",
  name: "Caja 1",
  last_successful_sync_at: "2026-03-02T09:30:00.000Z",
};
const neverSynced = { ...synced, id: "register-2", name: "Caja 2", last_successful_sync_at: null };

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
