import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { restorePendingIn } from "./restore-pending";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "restore-pending-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("the restore pending marker", () => {
  it("is not pending in a data folder that never began a restore", () => {
    const pending = restorePendingIn(folder);

    expect(pending.isPending()).toBe(false);
    expect(pending.deviceId()).toBeUndefined();
  });

  it("is pending, naming the installation, once a restore began, also for another reader of the folder", () => {
    restorePendingIn(folder).begin("device-new");

    const later = restorePendingIn(folder);
    expect(later.isPending()).toBe(true);
    expect(later.deviceId()).toBe("device-new");
  });

  it("names the installation of the latest enrollment when a restore begins again", () => {
    const pending = restorePendingIn(folder);
    pending.begin("device-first");
    pending.begin("device-second");

    expect(pending.deviceId()).toBe("device-second");
  });

  it("is not pending once cleared, and clearing twice is harmless", () => {
    const pending = restorePendingIn(folder);
    pending.begin("device-new");

    pending.clear();
    pending.clear();

    expect(pending.isPending()).toBe(false);
  });

  it("is pending without a known installation when the marker cannot be read", async () => {
    await writeFile(join(folder, "restore-pending"), "not json");

    const pending = restorePendingIn(folder);

    expect(pending.isPending()).toBe(true);
    expect(pending.deviceId()).toBeUndefined();
  });

  it("leaves no temporary file behind", async () => {
    restorePendingIn(folder).begin("device-new");

    expect(await readdir(folder)).toEqual(["restore-pending"]);
  });

  it("is never pending without a data folder", () => {
    const pending = restorePendingIn(undefined);

    expect(pending.isPending()).toBe(false);
    expect(() => pending.begin("device-new")).not.toThrow();
    expect(pending.isPending()).toBe(false);
  });

  it("does not ask to set the live database aside unless the restore began asking for it", () => {
    const pending = restorePendingIn(folder);

    expect(pending.setsAsideLiveDatabase()).toBe(false);
    pending.begin("device-new");
    expect(pending.setsAsideLiveDatabase()).toBe(false);
  });

  it("asks to set the live database aside, also for another reader of the folder", () => {
    restorePendingIn(folder).begin("device-new", { setAsideLiveDatabase: true });

    const later = restorePendingIn(folder);
    expect(later.setsAsideLiveDatabase()).toBe(true);
    expect(later.deviceId()).toBe("device-new");
  });

  it("stops asking to set the live database aside when a restore begins again without asking", () => {
    const pending = restorePendingIn(folder);
    pending.begin("device-first", { setAsideLiveDatabase: true });
    pending.begin("device-second");

    expect(pending.setsAsideLiveDatabase()).toBe(false);
    expect(pending.deviceId()).toBe("device-second");
  });

  it("does not ask to set the live database aside in a marker written before it could", async () => {
    await writeFile(join(folder, "restore-pending"), JSON.stringify({ device_id: "device-old" }));

    const pending = restorePendingIn(folder);

    expect(pending.setsAsideLiveDatabase()).toBe(false);
    expect(pending.deviceId()).toBe("device-old");
  });

  it("does not ask to set the live database aside when the marker cannot be read", async () => {
    await writeFile(join(folder, "restore-pending"), "not json");

    expect(restorePendingIn(folder).setsAsideLiveDatabase()).toBe(false);
  });

  it("keeps the restore pending for the same installation once the live database was set aside", async () => {
    const pending = restorePendingIn(folder);
    pending.begin("device-new", { setAsideLiveDatabase: true });

    pending.settleSetAside();

    expect(pending.setsAsideLiveDatabase()).toBe(false);
    expect(pending.isPending()).toBe(true);
    expect(pending.deviceId()).toBe("device-new");
    expect(await readdir(folder)).toEqual(["restore-pending"]);
  });

  it("begins no restore by settling a set-aside that nothing asked for", () => {
    const pending = restorePendingIn(folder);

    pending.settleSetAside();

    expect(pending.isPending()).toBe(false);
  });

  it("never asks to set the live database aside without a data folder", () => {
    const pending = restorePendingIn(undefined);

    pending.begin("device-new", { setAsideLiveDatabase: true });

    expect(pending.setsAsideLiveDatabase()).toBe(false);
    expect(() => pending.settleSetAside()).not.toThrow();
  });
});
