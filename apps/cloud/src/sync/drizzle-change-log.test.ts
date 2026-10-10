import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleOfflineAuthorizationCodeStore } from "../fiscal/drizzle-offline-authorization-code-store.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleChangeLog } from "./drizzle-change-log.js";

const SEPTEMBER_SECOND_HALF = { start: "2026-09-16", end: "2026-09-30" };
const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function keepCode(fortnight: { start: string; end: string }) {
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code: "36123456789012", fortnight, reportDeadline: "2026-10-30" },
      obtainedAt: new Date("2026-09-29T12:00:00.000Z"),
      obtainedThrough: "requested",
    }),
  );
}

describe("whether DrizzleChangeLog holds a fortnight's offline authorization code", () => {
  it("does not while no code was kept", async () => {
    const held = await new DrizzleChangeLog(db).transaction((tx) =>
      tx.holdsOfflineAuthorizationCodeFor(OCTOBER_FIRST_HALF),
    );

    expect(held).toBe(false);
  });

  it("does once the fortnight's code was kept", async () => {
    await keepCode(OCTOBER_FIRST_HALF);

    const held = await new DrizzleChangeLog(db).transaction((tx) =>
      tx.holdsOfflineAuthorizationCodeFor(OCTOBER_FIRST_HALF),
    );

    expect(held).toBe(true);
  });

  it("does not because another fortnight's code was kept", async () => {
    await keepCode(SEPTEMBER_SECOND_HALF);

    const held = await new DrizzleChangeLog(db).transaction((tx) =>
      tx.holdsOfflineAuthorizationCodeFor(OCTOBER_FIRST_HALF),
    );

    expect(held).toBe(false);
  });
});

describe("DrizzleChangeLog requesting the missing offline authorization code", () => {
  it("enqueues the request in the pull's own transaction", async () => {
    const enqueue = vi.fn<(transaction: unknown) => Promise<void>>().mockResolvedValue(undefined);

    await new DrizzleChangeLog(db, enqueue).transaction((tx) =>
      tx.requestMissingOfflineAuthorizationCode(),
    );

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toHaveProperty("execute");
  });

  it("does nothing when the cloud cannot request codes", async () => {
    await expect(
      new DrizzleChangeLog(db).transaction((tx) => tx.requestMissingOfflineAuthorizationCode()),
    ).resolves.toBeUndefined();
  });
});
