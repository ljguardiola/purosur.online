import { describe, expect, it } from "vitest";
import { openOverdueUnclearOutcomeAlerts } from "./open-overdue-unclear-outcome-alerts.js";
import { FixedClock } from "./test-support/fake-alert-store.js";
import {
  type FakeUnclearDocument,
  FakeUnclearOutcomeAlertStore,
} from "./test-support/fake-unclear-outcome-alert-store.js";

const UNCLEAR_SINCE = new Date("2026-10-01T08:00:00.000Z");
const MINUTE_MS = 60 * 1000;

const DOCUMENT: FakeUnclearDocument = {
  fiscalDocumentId: "document-1",
  saleId: "sale-1",
  registerId: "register-1",
  pointOfSale: 12,
  number: 41,
  unclearSince: UNCLEAR_SINCE,
  hasOpenUnclearOutcomeAlert: false,
};

function minutesAfterUnclear(minutes: number, milliseconds = 0): Date {
  return new Date(UNCLEAR_SINCE.getTime() + minutes * MINUTE_MS + milliseconds);
}

function evaluate(store: FakeUnclearOutcomeAlertStore, now: Date) {
  return openOverdueUnclearOutcomeAlerts({ store, clock: new FixedClock(now) });
}

describe("openOverdueUnclearOutcomeAlerts", () => {
  it("opens nothing for a document that has been unclear for less than 5 minutes", async () => {
    const store = new FakeUnclearOutcomeAlertStore([{ ...DOCUMENT }]);

    expect(await evaluate(store, minutesAfterUnclear(5, -1))).toEqual({
      kind: "opened",
      fiscalDocumentIds: [],
    });
    expect(store.opened).toEqual([]);
  });

  it("opens a warning when a document has been unclear for 5 minutes", async () => {
    const store = new FakeUnclearOutcomeAlertStore([{ ...DOCUMENT }]);
    const now = minutesAfterUnclear(5);

    expect(await evaluate(store, now)).toEqual({
      kind: "opened",
      fiscalDocumentIds: ["document-1"],
    });
    expect(store.opened).toEqual([
      {
        fiscalDocumentId: "document-1",
        saleId: "sale-1",
        registerId: "register-1",
        pointOfSale: 12,
        number: 41,
        unclearSince: UNCLEAR_SINCE,
        level: "warning",
        openedAt: now,
      },
    ]);
  });

  it("opens it already critical when the document has been unclear for 30 minutes or more", async () => {
    const store = new FakeUnclearOutcomeAlertStore([{ ...DOCUMENT }]);

    await evaluate(store, minutesAfterUnclear(30));

    expect(store.opened.map((alert) => alert.level)).toEqual(["critical"]);
  });

  it("does not open a second alert for a document that already has one open", async () => {
    const store = new FakeUnclearOutcomeAlertStore([{ ...DOCUMENT }]);
    await evaluate(store, minutesAfterUnclear(5));

    expect(await evaluate(store, minutesAfterUnclear(6))).toEqual({
      kind: "opened",
      fiscalDocumentIds: [],
    });
    expect(store.opened).toHaveLength(1);
  });

  it("opens an alert for each overdue document and none for one unclear for less than 5 minutes", async () => {
    const store = new FakeUnclearOutcomeAlertStore([
      { ...DOCUMENT },
      { ...DOCUMENT, fiscalDocumentId: "document-2", unclearSince: minutesAfterUnclear(8) },
      { ...DOCUMENT, fiscalDocumentId: "document-3", registerId: "register-2" },
    ]);

    const outcome = await evaluate(store, minutesAfterUnclear(10));

    expect(outcome).toEqual({
      kind: "opened",
      fiscalDocumentIds: ["document-1", "document-3"],
    });
    expect(store.opened.map((alert) => alert.registerId)).toEqual(["register-1", "register-2"]);
  });

  it("locks the documents before opening any alert, all in one transaction", async () => {
    const store = new FakeUnclearOutcomeAlertStore([{ ...DOCUMENT }]);

    await evaluate(store, minutesAfterUnclear(5));

    expect(store.operationOrder).toEqual(["lockDocuments", "openUnclearOutcomeAlert"]);
    expect(store.transactions).toBe(1);
  });

  it("opens no alert at all when opening one fails", async () => {
    const store = new FakeUnclearOutcomeAlertStore([
      { ...DOCUMENT },
      { ...DOCUMENT, fiscalDocumentId: "document-2" },
    ]);
    store.failOn = "openUnclearOutcomeAlert";

    await expect(evaluate(store, minutesAfterUnclear(5))).rejects.toThrow(
      "openUnclearOutcomeAlert failed",
    );

    expect(store.opened).toEqual([]);
  });
});
