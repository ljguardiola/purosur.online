import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleClockCorrectionReader } from "./drizzle-clock-correction-reader.js";
import {
  insertClockCorrection,
  insertOtherLocation,
  insertRegisterAndActor,
} from "./test-support/clock-correction-fixtures.js";

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

describe("DrizzleClockCorrectionReader", () => {
  it("lists a correction with its register, the person who made it, the readings and its alert's state", async () => {
    const locationId = await seededLocationId(db);
    const { registerId, actorId } = await insertRegisterAndActor(db, {
      locationId,
      registerName: "Caja 1",
      actorName: "Ada",
    });
    const correctedAt = new Date("2026-10-05T12:00:00.000Z");
    const { eventId } = await insertClockCorrection(db, {
      registerId,
      actorId,
      correctedAt,
      pointOfSale: 7,
      previousReading: new Date("2026-10-07T12:00:00.000Z"),
    });

    expect(
      await new DrizzleClockCorrectionReader(db).listBranchClockCorrections(locationId),
    ).toEqual([
      {
        eventId,
        correctedAt,
        registerId,
        registerName: "Caja 1",
        pointOfSale: 7,
        documentType: "factura_c",
        actorId,
        actorFirstName: "Ada",
        previousReading: new Date("2026-10-07T12:00:00.000Z"),
        correctedReading: correctedAt,
        alertState: "open",
      },
    ]);
  });

  it("tells a correction whose alert a person closed from one whose alert is still open", async () => {
    const locationId = await seededLocationId(db);
    const { registerId, actorId } = await insertRegisterAndActor(db, {
      locationId,
      registerName: "Caja 1",
      actorName: "Ada",
    });
    await insertClockCorrection(db, {
      registerId,
      actorId,
      correctedAt: new Date("2026-10-04T12:00:00.000Z"),
      alertClosed: true,
    });
    await insertClockCorrection(db, {
      registerId,
      actorId,
      correctedAt: new Date("2026-10-05T12:00:00.000Z"),
    });

    const listed = await new DrizzleClockCorrectionReader(db).listBranchClockCorrections(
      locationId,
    );

    expect(listed.map(({ alertState }) => alertState)).toEqual(["open", "closed"]);
  });

  it("lists the newest correction first", async () => {
    const locationId = await seededLocationId(db);
    const { registerId, actorId } = await insertRegisterAndActor(db, {
      locationId,
      registerName: "Caja 1",
      actorName: "Ada",
    });
    for (const day of ["02", "09", "05"]) {
      await insertClockCorrection(db, {
        registerId,
        actorId,
        correctedAt: new Date(`2026-10-${day}T12:00:00.000Z`),
      });
    }

    const listed = await new DrizzleClockCorrectionReader(db).listBranchClockCorrections(
      locationId,
    );

    expect(listed.map(({ correctedAt }) => correctedAt.toISOString().slice(0, 10))).toEqual([
      "2026-10-09",
      "2026-10-05",
      "2026-10-02",
    ]);
  });

  it("lists only the corrections of the registers of the branch asked for", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertOtherLocation(db);
    const own = await insertRegisterAndActor(db, {
      locationId,
      registerName: "Caja 1",
      actorName: "Ada",
    });
    const other = await insertRegisterAndActor(db, {
      locationId: otherLocationId,
      registerName: "Caja 9",
      actorName: "Berta",
    });
    const correctedAt = new Date("2026-10-05T12:00:00.000Z");
    await insertClockCorrection(db, { ...own, correctedAt });
    await insertClockCorrection(db, { ...other, correctedAt });

    const listed = await new DrizzleClockCorrectionReader(db).listBranchClockCorrections(
      locationId,
    );

    expect(listed.map(({ registerName }) => registerName)).toEqual(["Caja 1"]);
  });

  it("lists nothing for a branch whose registers never corrected their clock", async () => {
    expect(
      await new DrizzleClockCorrectionReader(db).listBranchClockCorrections(
        await seededLocationId(db),
      ),
    ).toEqual([]);
  });
});
