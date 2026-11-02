import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  registerContingencyIntervals,
  registerContingencyReporting,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleContingencyIntervalsReader } from "./drizzle-contingency-intervals-reader.js";
import {
  enrollRegister,
  insertFiscalAddress,
  insertRegisterAtFiscalAddress,
  moveRegisterToFiscalAddress,
} from "./test-support/exception-share-fixtures.js";

const at = (time: string) => new Date(`2026-10-06T${time}:00.000Z`);
const PERIOD = { from: at("00:00"), to: new Date("2026-10-07T00:00:00.000Z") };

const WHOLE_PERIOD = { start: PERIOD.from, end: PERIOD.to };
const BEFORE_THE_PERIOD = new Date("2026-01-01T00:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let central: string;
let norte: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  central = await insertFiscalAddress(db, "Depósito Central");
  norte = await insertFiscalAddress(db, "Local Norte");
});

async function interval(registerId: string, start: Date, end: Date | null) {
  await db.insert(registerContingencyIntervals).values({
    intervalId: crypto.randomUUID(),
    registerId,
    startedAt: start,
    endedAt: end,
  });
}

function read(fiscalAddressId: string, period = PERIOD) {
  return new DrizzleContingencyIntervalsReader(db).contingencyIntervalsAtFiscalAddress({
    fiscalAddressId,
    ...period,
  });
}

describe("DrizzleContingencyIntervalsReader", () => {
  it("answers the closed and the open intervals of a register at its fiscal address, an open one still open", async () => {
    const registerId = await insertRegisterAtFiscalAddress(db, central, "Caja 1");
    await interval(registerId, at("09:00"), at("09:40"));
    await interval(registerId, at("15:00"), null);

    const answer = await read(central);

    expect(answer.parts).toEqual([
      { registerId, start: at("09:00"), end: at("09:40") },
      { registerId, start: at("15:00"), end: null },
    ]);
  });

  it("counts an interval during which the register moved at each address for its part", async () => {
    const registerId = await insertRegisterAtFiscalAddress(db, central, "Caja 1");
    await interval(registerId, at("10:00"), at("12:00"));
    await moveRegisterToFiscalAddress(db, registerId, norte, at("11:00"));

    expect((await read(central)).parts).toEqual([
      { registerId, start: at("10:00"), end: at("11:00") },
    ]);
    expect((await read(norte)).parts).toEqual([
      { registerId, start: at("11:00"), end: at("12:00") },
    ]);
  });

  it("keeps an open interval open at the address the register moved to", async () => {
    const registerId = await insertRegisterAtFiscalAddress(db, central, "Caja 1");
    await interval(registerId, at("10:00"), null);
    await moveRegisterToFiscalAddress(db, registerId, norte, at("11:00"));

    expect((await read(central)).parts).toEqual([
      { registerId, start: at("10:00"), end: at("11:00") },
    ]);
    expect((await read(norte)).parts).toEqual([{ registerId, start: at("11:00"), end: null }]);
  });

  it("leaves out intervals that ended before the period or started after it", async () => {
    const registerId = await insertRegisterAtFiscalAddress(db, central, "Caja 1");
    await interval(
      registerId,
      new Date("2026-10-05T10:00:00.000Z"),
      new Date("2026-10-05T11:00:00.000Z"),
    );
    await interval(registerId, new Date("2026-10-07T10:00:00.000Z"), null);
    await interval(registerId, new Date("2026-10-05T23:00:00.000Z"), at("01:00"));

    expect((await read(central)).parts).toEqual([
      { registerId, start: new Date("2026-10-05T23:00:00.000Z"), end: at("01:00") },
    ]);
  });

  it("leaves out the intervals of registers at another fiscal address", async () => {
    const other = await insertRegisterAtFiscalAddress(db, norte, "Caja 2");
    await interval(other, at("09:00"), at("09:40"));

    expect((await read(central)).parts).toEqual([]);
  });

  it("answers when each register at the address started reporting its contingency, or that it has not", async () => {
    const reporting = await insertRegisterAtFiscalAddress(db, central, "Caja 1");
    const silent = await insertRegisterAtFiscalAddress(db, central, "Caja 2");
    await enrollRegister(db, reporting, BEFORE_THE_PERIOD);
    await enrollRegister(db, silent, BEFORE_THE_PERIOD);
    await db
      .insert(registerContingencyReporting)
      .values({ registerId: reporting, since: at("08:00") });

    const { registers } = await read(central);

    expect(registers).toHaveLength(2);
    expect(registers).toEqual(
      expect.arrayContaining([
        {
          registerId: reporting,
          reportingSince: at("08:00"),
          firstEnrolledAt: BEFORE_THE_PERIOD,
          presence: [WHOLE_PERIOD],
        },
        {
          registerId: silent,
          reportingSince: null,
          firstEnrolledAt: BEFORE_THE_PERIOD,
          presence: [WHOLE_PERIOD],
        },
      ]),
    );
  });

  it("answers a register at both addresses when it moved within the period, and none that left before it", async () => {
    const mover = await insertRegisterAtFiscalAddress(db, central, "Caja 1");
    const gone = await insertRegisterAtFiscalAddress(db, central, "Caja 2");
    await moveRegisterToFiscalAddress(db, mover, norte, at("11:00"));
    await moveRegisterToFiscalAddress(db, gone, norte, new Date("2026-10-05T11:00:00.000Z"));

    const atCentral = (await read(central)).registers.map(({ registerId }) => registerId);
    const atNorte = (await read(norte)).registers.map(({ registerId }) => registerId);

    expect(atCentral).toEqual([mover]);
    expect(atNorte.sort()).toEqual([mover, gone].sort());
  });

  it("answers the parts of the period during which each register belonged to the address", async () => {
    const mover = await insertRegisterAtFiscalAddress(db, central, "Caja 1");
    const returner = await insertRegisterAtFiscalAddress(db, central, "Caja 2");
    await moveRegisterToFiscalAddress(db, mover, norte, at("11:00"));
    await moveRegisterToFiscalAddress(db, returner, norte, at("06:00"));
    await moveRegisterToFiscalAddress(db, returner, central, at("18:00"));

    const presenceAt = async (fiscalAddressId: string) =>
      new Map(
        (await read(fiscalAddressId)).registers.map(({ registerId, presence }) => [
          registerId,
          presence,
        ]),
      );

    const atCentral = await presenceAt(central);
    const atNorte = await presenceAt(norte);

    expect(atCentral.get(mover)).toEqual([{ start: PERIOD.from, end: at("11:00") }]);
    expect(atCentral.get(returner)).toEqual([
      { start: PERIOD.from, end: at("06:00") },
      { start: at("18:00"), end: PERIOD.to },
    ]);
    expect(atNorte.get(mover)).toEqual([{ start: at("11:00"), end: PERIOD.to }]);
    expect(atNorte.get(returner)).toEqual([{ start: at("06:00"), end: at("18:00") }]);
  });

  it("answers when each register was first enrolled, or that it never was, beside its whole presence at the address", async () => {
    const enrolledLater = await insertRegisterAtFiscalAddress(db, central, "Caja 1");
    const reEnrolled = await insertRegisterAtFiscalAddress(db, central, "Caja 2");
    const neverEnrolled = await insertRegisterAtFiscalAddress(db, central, "Caja 3");
    await enrollRegister(db, enrolledLater, at("10:00"));
    await enrollRegister(db, reEnrolled, at("08:00"), at("12:00"));
    await enrollRegister(db, reEnrolled, at("12:00"));

    const { registers } = await read(central);

    expect(registers).toHaveLength(3);
    expect(registers).toEqual(
      expect.arrayContaining([
        {
          registerId: enrolledLater,
          reportingSince: null,
          firstEnrolledAt: at("10:00"),
          presence: [WHOLE_PERIOD],
        },
        {
          registerId: reEnrolled,
          reportingSince: null,
          firstEnrolledAt: at("08:00"),
          presence: [WHOLE_PERIOD],
        },
        {
          registerId: neverEnrolled,
          reportingSince: null,
          firstEnrolledAt: null,
          presence: [WHOLE_PERIOD],
        },
      ]),
    );
  });
});
