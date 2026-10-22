import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { restorePendingIn } from "./restore-pending";
import { setAsideStaleDatabase } from "./set-aside-stale-database";

const NOW = new Date("2026-10-21T15:04:05.678Z");
const KEPT = "register.stale-20261021T150405678Z.sqlite";

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "set-aside-stale-database-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function setAside() {
  return setAsideStaleDatabase({ folder, pending: restorePendingIn(folder), now: () => NOW });
}

async function files(): Promise<string[]> {
  return (await readdir(folder)).sort();
}

describe("setting the stale database aside", () => {
  it("does nothing while the restore does not ask for it", async () => {
    await writeFile(join(folder, "register.sqlite"), "live");
    restorePendingIn(folder).begin("device-new");

    expect(await setAside()).toEqual({ kind: "not_asked" });
    expect(await files()).toEqual(["register.sqlite", "restore-pending"]);
  });

  it("does nothing when no restore is pending", async () => {
    await writeFile(join(folder, "register.sqlite"), "live");

    expect(await setAside()).toEqual({ kind: "not_asked" });
    expect(await files()).toEqual(["register.sqlite"]);
  });

  it("keeps the live database and its journal files under a name that says when they were set aside", async () => {
    await writeFile(join(folder, "register.sqlite"), "live");
    await writeFile(join(folder, "register.sqlite-wal"), "wal");
    await writeFile(join(folder, "register.sqlite-shm"), "shm");
    restorePendingIn(folder).begin("device-new", { setAsideLiveDatabase: true });

    expect(await setAside()).toEqual({ kind: "set_aside", name: KEPT });

    expect(await files()).toEqual([KEPT, `${KEPT}-shm`, `${KEPT}-wal`, "restore-pending"]);
    expect(await readFile(join(folder, KEPT), "utf8")).toBe("live");
    expect(await readFile(join(folder, `${KEPT}-wal`), "utf8")).toBe("wal");
    expect(await readFile(join(folder, `${KEPT}-shm`), "utf8")).toBe("shm");
  });

  it("keeps the live database alone when it has no journal files", async () => {
    await writeFile(join(folder, "register.sqlite"), "live");
    restorePendingIn(folder).begin("device-new", { setAsideLiveDatabase: true });

    await setAside();

    expect(await files()).toEqual([KEPT, "restore-pending"]);
  });

  it("goes on with the restore of the same installation once the database was set aside", async () => {
    await writeFile(join(folder, "register.sqlite"), "live");
    restorePendingIn(folder).begin("device-new", { setAsideLiveDatabase: true });

    await setAside();

    const pending = restorePendingIn(folder);
    expect(pending.isPending()).toBe(true);
    expect(pending.deviceId()).toBe("device-new");
    expect(pending.setsAsideLiveDatabase()).toBe(false);
  });

  it("leaves a database set aside earlier untouched when it sets another aside the same moment", async () => {
    await writeFile(join(folder, KEPT), "earlier");
    await writeFile(join(folder, "register.sqlite"), "live");
    restorePendingIn(folder).begin("device-new", { setAsideLiveDatabase: true });

    const outcome = await setAside();

    expect(outcome.kind).toBe("set_aside");
    expect(await readFile(join(folder, KEPT), "utf8")).toBe("earlier");
    expect(await files()).toHaveLength(3);
  });

  it("only stops asking when an earlier start already moved the database away", async () => {
    restorePendingIn(folder).begin("device-new", { setAsideLiveDatabase: true });

    expect(await setAside()).toEqual({ kind: "nothing_to_set_aside" });

    const pending = restorePendingIn(folder);
    expect(pending.setsAsideLiveDatabase()).toBe(false);
    expect(pending.deviceId()).toBe("device-new");
    expect(await files()).toEqual(["restore-pending"]);
  });

  it("keeps the journal files an earlier start left behind, so a new database never replays them", async () => {
    await writeFile(join(folder, "register.sqlite-wal"), "wal");
    await writeFile(join(folder, "register.sqlite-shm"), "shm");
    restorePendingIn(folder).begin("device-new", { setAsideLiveDatabase: true });

    await setAside();

    expect(existsSync(join(folder, "register.sqlite-wal"))).toBe(false);
    expect(existsSync(join(folder, "register.sqlite-shm"))).toBe(false);
    expect(await files()).toEqual([`${KEPT}-shm`, `${KEPT}-wal`, "restore-pending"]);
  });

  it("leaves a staged snapshot where it is", async () => {
    await writeFile(join(folder, "register.sqlite"), "live");
    await writeFile(join(folder, "register.restored.sqlite"), "staged");
    restorePendingIn(folder).begin("device-new", { setAsideLiveDatabase: true });

    await setAside();

    expect(await readFile(join(folder, "register.restored.sqlite"), "utf8")).toBe("staged");
  });
});
