import { describe, expect, it } from "vitest";
import type { NumberingReconciliationDocument } from "../model/numbering-conflict.js";
import { reconcileNumberingConflict } from "./reconcile-numbering-conflict.js";
import type { LastAuthorizedAnswer } from "./tax-authority-count-ports.js";
import {
  FakeNumberingConflictStore,
  FakeNumberingTaxAuthority,
  FakeNumberingTokens,
} from "./test-support/fake-numbering-conflict.js";

const FROZEN_AT = new Date("2026-10-01T10:00:00.000Z");

const TOKEN = {
  token: "token",
  sign: "sign",
  issuedAt: new Date("2026-10-01T08:00:00.000Z"),
  expiresAt: new Date("2026-10-01T20:00:00.000Z"),
};

const authorized = (number: number): NumberingReconciliationDocument => ({
  number,
  settlement: "authorized",
});

interface Scenario {
  frozen?: boolean;
  token?: typeof TOKEN | null;
  lastAuthorized?: LastAuthorizedAnswer;
  documents?: NumberingReconciliationDocument[];
  count?: number;
}

function scenario({
  frozen = true,
  token = TOKEN,
  lastAuthorized = { kind: "read", number: 14 },
  documents = [authorized(11), authorized(12), authorized(13), authorized(14)],
  count = 10,
}: Scenario = {}) {
  const store = new FakeNumberingConflictStore();
  store.seedCount(12, count);
  store.seedDocuments(12, documents);
  if (frozen) {
    store.seedFreeze(12, { countBeforeFreeze: 10, frozenAt: FROZEN_AT });
  }
  const taxAuthority = new FakeNumberingTaxAuthority(store, lastAuthorized);
  const ports = {
    lanes: store,
    tokens: new FakeNumberingTokens(token),
    taxAuthority,
  };
  return { store, taxAuthority, ports };
}

function reconcile(ports: ReturnType<typeof scenario>["ports"]) {
  return reconcileNumberingConflict(ports, { pointOfSale: 12 });
}

const STILL_FROZEN = { countBeforeFreeze: 10, frozenAt: FROZEN_AT };

describe("reconcileNumberingConflict", () => {
  it("answers not frozen without asking the tax authority when the point of sale is not frozen", async () => {
    const { store, taxAuthority, ports } = scenario({ frozen: false });

    expect(await reconcile(ports)).toEqual({ kind: "not_frozen" });
    expect(taxAuthority.lastAuthorizedAsked).toBe(0);
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
  });

  it("retries and stays frozen when no token is valid", async () => {
    const { store, taxAuthority, ports } = scenario({ token: null });

    expect(await reconcile(ports)).toEqual({ kind: "retry" });
    expect(taxAuthority.lastAuthorizedAsked).toBe(0);
    expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
  });

  it("retries and stays frozen when the tax authority's last authorized number cannot be read", async () => {
    const { store, ports } = scenario({ lastAuthorized: { kind: "no_answer" } });

    expect(await reconcile(ports)).toEqual({ kind: "retry" });
    expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
  });

  it("reads the tax authority inside the point of sale's lane", async () => {
    const { taxAuthority, ports } = scenario();

    await reconcile(ports);

    expect(taxAuthority.heldLaneDuringLookups).toEqual([true]);
  });

  it("waits and stays frozen while a document of the range is undecided", async () => {
    const { store, ports } = scenario({
      documents: [authorized(11), { number: 12, settlement: "undecided" }],
    });

    expect(await reconcile(ports)).toEqual({ kind: "waiting" });
    expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
  });

  it("reconciles without alerts when an authorized document accounts for every number", async () => {
    const { store, ports } = scenario();

    expect(await reconcile(ports)).toEqual({
      kind: "reconciled",
      lastAuthorized: 14,
      alertedNumbers: [],
    });
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(14);
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it("alerts a number with no document", async () => {
    const { store, ports } = scenario({
      documents: [authorized(11), authorized(13), authorized(14)],
    });

    expect(await reconcile(ports)).toMatchObject({ alertedNumbers: [12] });
    expect(store.alerts).toEqual([{ pointOfSale: 12, documentType: "factura_c", number: 12 }]);
  });

  it("alerts a number whose document was released or rejected", async () => {
    const { store, ports } = scenario({
      documents: [
        authorized(11),
        { number: 12, settlement: "released_or_rejected" },
        authorized(13),
        authorized(14),
      ],
    });

    expect(await reconcile(ports)).toMatchObject({ alertedNumbers: [12] });
    expect(store.alerts.map(({ number }) => number)).toEqual([12]);
  });

  it("alerts a number whose document is conflicting", async () => {
    const { store, ports } = scenario({
      documents: [
        authorized(11),
        authorized(12),
        { number: 13, settlement: "conflicting" },
        authorized(14),
      ],
    });

    expect(await reconcile(ports)).toMatchObject({ alertedNumbers: [13] });
    expect(store.alerts.map(({ number }) => number)).toEqual([13]);
  });

  it("does not alert a number when one of several documents at it is authorized", async () => {
    const { store, ports } = scenario({
      documents: [
        { number: 11, settlement: "released_or_rejected" },
        authorized(11),
        { number: 12, settlement: "conflicting" },
        authorized(12),
        authorized(13),
        authorized(14),
      ],
    });

    expect(await reconcile(ports)).toMatchObject({ alertedNumbers: [] });
    expect(store.alerts).toEqual([]);
  });

  it("ignores documents at or below the count before the freeze and above the last authorized number", async () => {
    const { ports } = scenario({
      documents: [
        { number: 10, settlement: "undecided" },
        authorized(11),
        authorized(12),
        authorized(13),
        authorized(14),
        { number: 15, settlement: "undecided" },
      ],
    });

    expect(await reconcile(ports)).toMatchObject({ kind: "reconciled" });
  });

  it("opens the alerts, then sets the count to continue after the last authorized number, then lifts the freeze", async () => {
    const { store, ports } = scenario({ documents: [authorized(11), authorized(14)] });

    await reconcile(ports);

    const writes = store.operations.filter(
      (operation) =>
        operation.startsWith("openExternalBillingAlert") ||
        operation.startsWith("continueNumberingAfter") ||
        operation === "liftNumberingFreeze",
    );
    expect(writes).toEqual([
      "openExternalBillingAlert:12",
      "openExternalBillingAlert:13",
      "continueNumberingAfter:14",
      "liftNumberingFreeze",
    ]);
  });

  it("never lowers a count above the last authorized number", async () => {
    const { store, ports } = scenario({ count: 20 });

    expect(await reconcile(ports)).toMatchObject({ kind: "reconciled" });
    expect(store.countOf(12)).toBe(20);
  });

  it("reconciles an empty range when the tax authority is still at the count before the freeze", async () => {
    const { store, ports } = scenario({
      lastAuthorized: { kind: "read", number: 10 },
      documents: [],
    });

    expect(await reconcile(ports)).toEqual({
      kind: "reconciled",
      lastAuthorized: 10,
      alertedNumbers: [],
    });
    expect(store.freezeOf(12)).toBeUndefined();
  });

  it.each([
    "openExternalBillingAlert:13",
    "continueNumberingAfter",
    "liftNumberingFreeze",
  ])("leaves the alerts, the count and the freeze as they were when %s fails", async (failing) => {
    const { store, ports } = scenario({ documents: [authorized(11), authorized(14)] });
    store.failOn = failing;

    await expect(reconcile(ports)).rejects.toThrow();
    expect(store.alerts).toEqual([]);
    expect(store.countOf(12)).toBe(10);
    expect(store.freezeOf(12)).toEqual(STILL_FROZEN);
  });
});
