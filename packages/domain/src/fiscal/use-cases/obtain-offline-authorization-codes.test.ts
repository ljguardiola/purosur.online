import { describe, expect, it } from "vitest";
import type { Fortnight } from "../model/offline-authorization-code.js";
import { obtainOfflineAuthorizationCodes } from "./obtain-offline-authorization-codes.js";
import type {
  OfflineAuthorizationCode,
  OfflineAuthorizationCodeLookupAnswer,
} from "./offline-authorization-code-ports.js";
import { ManualClock } from "./test-support/fake-arca-vitality.js";
import {
  FakeOfflineAuthorizationCodeStore,
  FakeTaxAuthorityOfflineAuthorizationCodes,
} from "./test-support/fake-offline-authorization-codes.js";

const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-10T08:00:00.000Z"),
  expiresAt: new Date("2026-10-10T20:00:00.000Z"),
};
const FIRST_OCTOBER_HALF: Fortnight = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_OCTOBER_HALF: Fortnight = { start: "2026-10-16", end: "2026-10-31" };
const ON_OCTOBER_10 = new Date("2026-10-10T15:00:00.000Z");
const ON_OCTOBER_11 = new Date("2026-10-11T15:00:00.000Z");

function codeFor(fortnight: Fortnight): OfflineAuthorizationCode {
  return {
    code: fortnight.start === FIRST_OCTOBER_HALF.start ? "36123456789012" : "36123456789013",
    fortnight,
    reportDeadline: fortnight.start === FIRST_OCTOBER_HALF.start ? "2026-10-20" : "2026-11-05",
  };
}

function setUp({ now = ON_OCTOBER_10, token = TOKEN as typeof TOKEN | null } = {}) {
  const store = new FakeOfflineAuthorizationCodeStore();
  const taxAuthority = new FakeTaxAuthorityOfflineAuthorizationCodes(store);
  taxAuthority.requestAnswer = (fortnight) => ({ kind: "granted", code: codeFor(fortnight) });
  const clock = new ManualClock(now);
  const obtain = () =>
    obtainOfflineAuthorizationCodes({
      store,
      tokens: { validToken: async () => token },
      taxAuthority,
      clock,
    });
  return { store, taxAuthority, clock, obtain };
}

describe("obtainOfflineAuthorizationCodes", () => {
  it("requests nothing while no offline point of sale is configured", async () => {
    const { store, taxAuthority, obtain } = setUp();
    store.offlinePointOfSaleConfigured = false;

    await expect(obtain()).resolves.toEqual({ kind: "no_offline_point_of_sale" });
    expect(taxAuthority.requests).toEqual([]);
    expect(store.operations).toEqual([]);
  });

  it("requests the current fortnight's code and keeps it with its fortnight and reporting deadline", async () => {
    const { store, taxAuthority, obtain } = setUp();

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "obtained" } }],
    });
    expect(taxAuthority.requests).toEqual([
      { token: TOKEN, fortnight: FIRST_OCTOBER_HALF, heldDuringCall: true },
    ]);
    expect(store.kept).toEqual([
      {
        code: codeFor(FIRST_OCTOBER_HALF),
        obtainedAt: ON_OCTOBER_10,
        obtainedThrough: "requested",
      },
    ]);
  });

  it("requests nothing for the next fortnight before its window opens in Argentina", async () => {
    const { taxAuthority, obtain } = setUp({ now: new Date("2026-10-11T02:59:59.999Z") });

    await obtain();

    expect(taxAuthority.requests.map(({ fortnight }) => fortnight)).toEqual([FIRST_OCTOBER_HALF]);
  });

  it("also requests the next fortnight's code once its window opens in Argentina", async () => {
    const { store, taxAuthority, obtain } = setUp({ now: new Date("2026-10-11T03:00:00.000Z") });

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [
        { fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "obtained" } },
        { fortnight: SECOND_OCTOBER_HALF, outcome: { kind: "obtained" } },
      ],
    });
    expect(taxAuthority.requests.map(({ fortnight }) => fortnight)).toEqual([
      FIRST_OCTOBER_HALF,
      SECOND_OCTOBER_HALF,
    ]);
    expect(store.kept.map(({ code }) => code)).toEqual([
      codeFor(FIRST_OCTOBER_HALF),
      codeFor(SECOND_OCTOBER_HALF),
    ]);
  });

  it("makes no second request for a fortnight whose code is held", async () => {
    const { taxAuthority, clock, obtain } = setUp();
    await obtain();
    clock.advanceBy(ON_OCTOBER_11.getTime() - ON_OCTOBER_10.getTime());

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [
        { fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "held" } },
        { fortnight: SECOND_OCTOBER_HALF, outcome: { kind: "obtained" } },
      ],
    });
    expect(taxAuthority.requests.map(({ fortnight }) => fortnight)).toEqual([
      FIRST_OCTOBER_HALF,
      SECOND_OCTOBER_HALF,
    ]);
  });

  it("holds the fortnight's acquisition from checking it is held until the code is kept", async () => {
    const { store, obtain } = setUp();

    await obtain();

    expect(store.operations).toEqual([
      "hold 2026-10-01",
      "isHeld 2026-10-01",
      "request 2026-10-01",
      "keep 2026-10-01",
      "release 2026-10-01",
    ]);
  });

  it("retrieves a code already granted and keeps it as recovered", async () => {
    const { store, taxAuthority, obtain } = setUp();
    taxAuthority.requestAnswer = () => ({ kind: "already_granted" });
    taxAuthority.lookUpAnswer = (fortnight) => ({ kind: "granted", code: codeFor(fortnight) });

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "recovered" } }],
    });
    expect(taxAuthority.lookUps).toEqual([
      { token: TOKEN, fortnight: FIRST_OCTOBER_HALF, heldDuringCall: true },
    ]);
    expect(store.kept).toEqual([
      {
        code: codeFor(FIRST_OCTOBER_HALF),
        obtainedAt: ON_OCTOBER_10,
        obtainedThrough: "recovered",
      },
    ]);
  });

  it("recovers on the next attempt a code granted while keeping it failed", async () => {
    const { store, taxAuthority, obtain } = setUp();
    store.failingKeep = true;
    await expect(obtain()).rejects.toThrow("keep failed");
    expect(store.kept).toEqual([]);
    expect(store.operations.at(-1)).toBe("release 2026-10-01");

    store.failingKeep = false;
    taxAuthority.requestAnswer = () => ({ kind: "already_granted" });
    taxAuthority.lookUpAnswer = (fortnight) => ({ kind: "granted", code: codeFor(fortnight) });

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "recovered" } }],
    });
    expect(store.kept.map(({ code }) => code)).toEqual([codeFor(FIRST_OCTOBER_HALF)]);
  });

  it.each<OfflineAuthorizationCodeLookupAnswer>([
    { kind: "not_granted" },
    { kind: "refused", rejections: [{ code: 600, message: "ValidacionDeToken" }] },
    { kind: "no_answer" },
  ])("keeps nothing when a granted code can't be retrieved ($kind)", async (answer) => {
    const { store, taxAuthority, obtain } = setUp();
    taxAuthority.requestAnswer = () => ({ kind: "already_granted" });
    taxAuthority.lookUpAnswer = () => answer;

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "not_recovered" } }],
    });
    expect(store.kept).toEqual([]);
  });

  it("keeps nothing when the tax authority refuses the request, and requests again on the next attempt", async () => {
    const { store, taxAuthority, obtain } = setUp();
    const rejections = [{ code: 15006, message: "Fuera de la ventana" }];
    taxAuthority.requestAnswer = () => ({ kind: "refused", rejections });

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "refused", rejections } }],
    });
    expect(store.kept).toEqual([]);

    taxAuthority.requestAnswer = (fortnight) => ({ kind: "granted", code: codeFor(fortnight) });
    await obtain();
    expect(taxAuthority.requests).toHaveLength(2);
    expect(store.kept.map(({ code }) => code)).toEqual([codeFor(FIRST_OCTOBER_HALF)]);
  });

  it("keeps nothing when the tax authority gives no answer", async () => {
    const { store, taxAuthority, obtain } = setUp();
    taxAuthority.requestAnswer = () => ({ kind: "no_answer" });

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "no_answer" } }],
    });
    expect(store.kept).toEqual([]);
  });

  it("goes on to the next fortnight after one fails", async () => {
    const { store, taxAuthority, obtain } = setUp({ now: ON_OCTOBER_11 });
    taxAuthority.requestAnswer = (fortnight) =>
      fortnight.start === FIRST_OCTOBER_HALF.start
        ? { kind: "no_answer" }
        : { kind: "granted", code: codeFor(fortnight) };

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [
        { fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "no_answer" } },
        { fortnight: SECOND_OCTOBER_HALF, outcome: { kind: "obtained" } },
      ],
    });
    expect(store.kept.map(({ code }) => code)).toEqual([codeFor(SECOND_OCTOBER_HALF)]);
  });

  it("requests nothing without a valid token", async () => {
    const { store, taxAuthority, obtain } = setUp({ token: null });

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "no_token" } }],
    });
    expect(taxAuthority.requests).toEqual([]);
    expect(store.kept).toEqual([]);
  });

  it("keeps nothing when the tax authority grants a code for another fortnight", async () => {
    const { store, taxAuthority, obtain } = setUp();
    taxAuthority.requestAnswer = () => ({ kind: "granted", code: codeFor(SECOND_OCTOBER_HALF) });

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "unexpected_fortnight" } }],
    });
    expect(store.kept).toEqual([]);
  });

  it("keeps nothing when the tax authority retrieves a code for another fortnight", async () => {
    const { store, taxAuthority, obtain } = setUp();
    taxAuthority.requestAnswer = () => ({ kind: "already_granted" });
    taxAuthority.lookUpAnswer = () => ({ kind: "granted", code: codeFor(SECOND_OCTOBER_HALF) });

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: FIRST_OCTOBER_HALF, outcome: { kind: "unexpected_fortnight" } }],
    });
    expect(store.kept).toEqual([]);
  });

  it("obtains during the fortnight a code every earlier attempt missed, the same as in advance", async () => {
    const { store, obtain } = setUp({ now: new Date("2026-10-20T15:00:00.000Z") });

    await expect(obtain()).resolves.toEqual({
      kind: "attempted",
      fortnights: [{ fortnight: SECOND_OCTOBER_HALF, outcome: { kind: "obtained" } }],
    });
    expect(store.kept).toEqual([
      {
        code: codeFor(SECOND_OCTOBER_HALF),
        obtainedAt: new Date("2026-10-20T15:00:00.000Z"),
        obtainedThrough: "requested",
      },
    ]);
  });
});
