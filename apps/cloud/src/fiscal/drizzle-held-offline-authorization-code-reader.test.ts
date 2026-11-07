import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleHeldOfflineAuthorizationCodeReader } from "./drizzle-held-offline-authorization-code-reader.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };

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

function keep(fortnight: { start: string; end: string }, code: string, reportDeadline: string) {
  return new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code, fortnight, reportDeadline },
      obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
      obtainedThrough: "requested",
    }),
  );
}

describe("DrizzleHeldOfflineAuthorizationCodeReader.heldCodeOf", () => {
  it("answers the code stored for the fortnight with its report deadline", async () => {
    await keep(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");

    expect(
      await new DrizzleHeldOfflineAuthorizationCodeReader(db).heldCodeOf(OCTOBER_FIRST_HALF),
    ).toEqual({
      code: "36123456789012",
      fortnight: OCTOBER_FIRST_HALF,
      reportDeadline: "2026-10-20",
    });
  });

  it("answers the code of the asked fortnight and not another stored one", async () => {
    await keep(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");
    await keep(OCTOBER_SECOND_HALF, "36123456789013", "2026-11-05");

    expect(
      await new DrizzleHeldOfflineAuthorizationCodeReader(db).heldCodeOf(OCTOBER_SECOND_HALF),
    ).toMatchObject({ code: "36123456789013", fortnight: OCTOBER_SECOND_HALF });
  });

  it("answers none when no code is stored for the fortnight", async () => {
    await keep(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");

    expect(
      await new DrizzleHeldOfflineAuthorizationCodeReader(db).heldCodeOf(OCTOBER_SECOND_HALF),
    ).toBeNull();
  });
});
