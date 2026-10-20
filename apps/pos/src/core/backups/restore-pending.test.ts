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
});
