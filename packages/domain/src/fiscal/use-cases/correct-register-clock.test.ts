import { describe, expect, it } from "vitest";
import type { CashSessionStanding, ClockMark } from "../model/clock-correction.js";
import type { FacturaC } from "../model/pre-emission-gate.js";
import { decideSaleAuthorizationRoute } from "../model/real-time-authorization.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../test-support/fictional-tax-identities.js";
import { type CorrectRegisterClockGrant, correctRegisterClock } from "./correct-register-clock.js";
import {
  FakeClockCorrectionAuthority,
  FakeClockCorrectionLedger,
} from "./test-support/fake-clock-correction.js";
import { SequentialIds } from "./test-support/fake-sale-authorization.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const READING = new Date("2026-10-01T12:00:00.000Z");
const ahead = (ms: number) => new Date(READING.getTime() + ms);
const CORRECTOR = { isAdministrator: false, permissionKeys: ["correct_register_clock"] };
const CASHIER = { isAdministrator: false, permissionKeys: ["sell_and_charge"] };
const NO_SESSION: CashSessionStanding = { openSessionId: null, lastClosedSessionId: null };
const NOT_SIGNED_IN = { kind: "not_signed_in" } as const;
const REAL_TIME_MARK: ClockMark = {
  pointOfSale: 12,
  documentType: "factura_c",
  reading: ahead(3_600_000),
};
const OFFLINE_MARK: ClockMark = {
  pointOfSale: 7,
  documentType: "factura_c",
  reading: ahead(120_000),
};

function ledger(state: ConstructorParameters<typeof FakeClockCorrectionLedger>[0] = {}) {
  return new FakeClockCorrectionLedger({
    accesses: { ana: CORRECTOR, bruno: CASHIER },
    marks: [{ ...REAL_TIME_MARK }, { ...OFFLINE_MARK }],
    ...state,
  });
}

function correct(store: FakeClockCorrectionLedger, correctorId = "ana") {
  const authority = new FakeClockCorrectionAuthority<CorrectRegisterClockGrant, never>({
    kind: "granted",
    grant: { correctorId },
  });
  return correctRegisterClock({
    ledger: store,
    clock: new FixedClock(READING),
    ids: new SequentialIds(),
    authority,
  });
}

describe("correctRegisterClock", () => {
  it("lowers every mark more than a minute ahead of the reading to the reading and reports each", async () => {
    const store = ledger();

    const outcome = await correct(store);

    const lowerings = [
      {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: REAL_TIME_MARK.reading,
        correctedReading: READING,
      },
      {
        pointOfSale: 7,
        documentType: "factura_c",
        previousReading: OFFLINE_MARK.reading,
        correctedReading: READING,
      },
    ];
    expect(outcome).toEqual({ kind: "corrected", lowerings, grant: { correctorId: "ana" } });
    expect(store.state.marks.map(({ reading }) => reading)).toEqual([READING, READING]);
  });

  it("leaves a mark within a minute of the reading, or behind it, as it was", async () => {
    const within = { pointOfSale: 3, documentType: "factura_c", reading: ahead(60_000) } as const;
    const behind = { pointOfSale: 4, documentType: "factura_c", reading: ahead(-5_000) } as const;
    const store = ledger({ marks: [{ ...REAL_TIME_MARK }, { ...within }, { ...behind }] });

    await correct(store);

    expect(store.state.marks).toEqual([{ ...REAL_TIME_MARK, reading: READING }, within, behind]);
  });

  it("records the correction of each lowered point of sale against the register and the person, in the period it was made", async () => {
    const store = ledger({
      standing: { openSessionId: "session-2", lastClosedSessionId: "session-1" },
    });

    await correct(store);

    expect(store.state.records).toEqual([
      {
        period: "session-2",
        registerId: "register-1",
        actorId: "ana",
        lowering: {
          pointOfSale: 12,
          documentType: "factura_c",
          previousReading: REAL_TIME_MARK.reading,
          correctedReading: READING,
        },
      },
      {
        period: "session-2",
        registerId: "register-1",
        actorId: "ana",
        lowering: {
          pointOfSale: 7,
          documentType: "factura_c",
          previousReading: OFFLINE_MARK.reading,
          correctedReading: READING,
        },
      },
    ]);
  });

  it("appends a clock_corrected event for each lowered point of sale", async () => {
    const store = ledger();

    await correct(store);

    expect(store.state.outbox).toMatchObject([
      {
        event_id: "id-1",
        aggregate_type: "CashRegister",
        aggregate_id: "register-1",
        event_type: "clock_corrected",
        payload: {
          point_of_sale: 12,
          document_type: "factura_c",
          previous_reading: "2026-10-01T13:00:00.000Z",
          corrected_reading: "2026-10-01T12:00:00.000Z",
        },
        actor_id: "ana",
      },
      {
        event_id: "id-2",
        event_type: "clock_corrected",
        payload: { point_of_sale: 7, previous_reading: "2026-10-01T12:02:00.000Z" },
        actor_id: "ana",
      },
    ]);
  });

  it("does everything in one transaction", async () => {
    const store = ledger();

    await correct(store);

    expect(store.transactions).toBe(1);
  });

  it("leaves the tax authority's floor in force: a lowered mark still blocks a series behind the day the tax authority last authorized on", async () => {
    const store = ledger();
    await correct(store);
    const document = {
      invoiceClass: "C",
      total: 1,
      netAmount: 1,
      vatAmount: 0,
      issuer: {
        legalName: FICTIONAL_LEGAL_NAME,
        cuit: FICTIONAL_CUIT,
        taxStatus: "MONOTRIBUTO",
        grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activityStartDate: "2020-01-01",
        version: 1,
      },
      buyerTaxStatusCode: 5,
      buyerTaxStatusDescription: "Consumidor Final",
    } satisfies FacturaC;

    const route = decideSaleAuthorizationRoute({
      gate: { kind: "passed", document },
      online: { lastHealthCheckOkAt: ahead(-1_000), tokenValid: true, arcaReachable: true },
      now: READING,
      occurredAt: READING,
      series: {
        pointOfSale: 12,
        localLastAuthorized: 40,
        taxAuthorityLastAuthorized: 38,
        documentRequesting: false,
        documentUnknown: false,
        numberingFrozen: false,
        clockMark: store.state.marks[0]?.reading ?? null,
        taxAuthorityLastIssuedOn: "2026-10-02",
        latestClockCorrection: null,
      },
      offlineSeries: {
        pointOfSale: 7,
        blocksInAssignmentOrder: [{ firstNumber: 101, lastNumber: 1100 }],
        localLastUsed: null,
        taxAuthorityLastAuthorized: 100,
        highestSyncedNumber: null,
        clockMark: store.state.marks[1]?.reading ?? null,
      },
      offlineAuthorizationCode: "71234567890123",
    });

    expect(route).toEqual({ kind: "defer", reason: "clock_behind" });
  });

  it.each([
    ["a person without the permission", "bruno"],
    ["a person with no access", "carla"],
  ])("refuses %s and changes nothing", async (_case, correctorId) => {
    const store = ledger();

    const outcome = await correct(store, correctorId);

    expect(outcome).toEqual({ kind: "not_permitted" });
    expect(store.state.marks).toEqual([REAL_TIME_MARK, OFFLINE_MARK]);
    expect(store.state.records).toEqual([]);
    expect(store.state.outbox).toEqual([]);
  });

  it("answers unavailable, changing nothing, when the register's identity is not known", async () => {
    const store = ledger({ registerId: undefined });

    await expect(correct(store)).resolves.toEqual({ kind: "unavailable" });
    expect(store.state.records).toEqual([]);
  });

  it("answers the authority's refusal without opening a transaction", async () => {
    const store = ledger();
    const authority = new FakeClockCorrectionAuthority<
      CorrectRegisterClockGrant,
      typeof NOT_SIGNED_IN
    >({
      kind: "refused",
      refusal: NOT_SIGNED_IN,
    });

    const outcome = await correctRegisterClock({
      ledger: store,
      clock: new FixedClock(READING),
      ids: new SequentialIds(),
      authority,
    });

    expect(outcome).toEqual(NOT_SIGNED_IN);
    expect(store.transactions).toBe(0);
  });

  describe("when no mark is more than a minute ahead of the reading", () => {
    const aligned = [{ ...REAL_TIME_MARK, reading: ahead(60_000) }];

    it("answers not behind and records nothing", async () => {
      const store = ledger({ marks: aligned });

      await expect(correct(store)).resolves.toEqual({ kind: "not_behind" });
      expect(store.state.records).toEqual([]);
      expect(store.state.outbox).toEqual([]);
    });

    it("answers not behind for a register with no mark at all", async () => {
      await expect(correct(ledger({ marks: [] }))).resolves.toEqual({ kind: "not_behind" });
    });

    it("does not use up the period's correction", async () => {
      const store = ledger({ marks: aligned });
      await correct(store);
      store.state.marks.push({ ...OFFLINE_MARK });

      await expect(correct(store)).resolves.toMatchObject({ kind: "corrected" });
    });
  });

  describe("the once-per-period rule", () => {
    function inPeriod(standing: CashSessionStanding) {
      const store = ledger({ standing });
      return { store, again: () => store.state.marks.splice(0, 1, { ...REAL_TIME_MARK }) };
    }

    it("refuses a second correction in the same cash session", async () => {
      const { store, again } = inPeriod({ openSessionId: "session-2", lastClosedSessionId: null });
      await correct(store);
      again();

      await expect(correct(store)).resolves.toEqual({ kind: "already_corrected_in_period" });
      expect(store.state.marks[0]).toEqual(REAL_TIME_MARK);
      expect(store.state.records).toHaveLength(2);
    });

    it("lets the next cash session have its own correction", async () => {
      const { store, again } = inPeriod({ openSessionId: "session-2", lastClosedSessionId: null });
      await correct(store);
      store.state.standing = { openSessionId: "session-3", lastClosedSessionId: "session-2" };
      again();

      await expect(correct(store)).resolves.toMatchObject({ kind: "corrected" });
    });

    it("refuses a second correction between a session's close and the next opening", async () => {
      const { store, again } = inPeriod({ openSessionId: null, lastClosedSessionId: "session-1" });
      await correct(store);
      again();

      await expect(correct(store)).resolves.toEqual({ kind: "already_corrected_in_period" });
    });

    it("refuses a second correction before any session was ever opened", async () => {
      const { store, again } = inPeriod(NO_SESSION);
      await correct(store);
      again();

      await expect(correct(store)).resolves.toEqual({ kind: "already_corrected_in_period" });
    });

    it("does not use up the next session's correction with one made while none was open", async () => {
      const { store, again } = inPeriod({ openSessionId: null, lastClosedSessionId: "session-1" });
      await correct(store);
      store.state.standing = { openSessionId: "session-2", lastClosedSessionId: "session-1" };
      again();

      await expect(correct(store)).resolves.toMatchObject({ kind: "corrected" });
      again();
      await expect(correct(store)).resolves.toEqual({ kind: "already_corrected_in_period" });
    });

    it("gives the period after a session's close its own correction", async () => {
      const { store, again } = inPeriod({
        openSessionId: "session-2",
        lastClosedSessionId: "session-1",
      });
      await correct(store);
      store.state.standing = { openSessionId: null, lastClosedSessionId: "session-2" };
      again();

      await expect(correct(store)).resolves.toMatchObject({ kind: "corrected" });
    });
  });
});
