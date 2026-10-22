import { describe, expect, it } from "vitest";
import type { RecordedDocumentTypeReport } from "./fortnight-report-ports.js";
import { remedyRejectedDocument } from "./remedy-rejected-document.js";
import { offlineDocument } from "./test-support/fake-fortnight-reports.js";
import {
  DEFAULT_LOCATION_ID,
  FakeRemedyRejectedDocumentStore,
} from "./test-support/fake-remedy-rejected-document.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const FORTNIGHT = { start: "2026-09-16", end: "2026-09-30" };
const KEY = { pointOfSaleNumber: 7, fortnight: FORTNIGHT };
const ACTOR = "user-1";
const NOW = new Date("2026-10-20T15:00:00.000Z");
const REJECTED_AT = new Date("2026-10-19T15:00:00.000Z");

function rejection(
  overrides: Partial<RecordedDocumentTypeReport> = {},
): RecordedDocumentTypeReport {
  return {
    documentType: "factura_c",
    state: "refused",
    reportedThrough: 2,
    rejectedNumber: 3,
    lastAttemptAt: REJECTED_AT,
    rejections: [{ code: 1439, message: "ImpTotal" }],
    remedy: null,
    ...overrides,
  };
}

function setUp(report: RecordedDocumentTypeReport | null = rejection()) {
  const store = new FakeRemedyRejectedDocumentStore();
  if (report !== null) {
    store.seedDocumentTypeReport(KEY, report);
  }
  store.seedDocuments(7, FORTNIGHT, [
    offlineDocument(2, { issuedOn: "2026-09-18" }),
    offlineDocument(3, { issuedOn: "2026-09-20" }),
    offlineDocument(4, { issuedOn: "2026-09-24" }),
  ]);
  return store;
}

function remedy(
  store: FakeRemedyRejectedDocumentStore,
  overrides: Partial<Parameters<typeof remedyRejectedDocument>[1]> = {},
) {
  return remedyRejectedDocument(
    { store, clock: new FixedClock(NOW) },
    {
      locationId: DEFAULT_LOCATION_ID,
      pointOfSaleNumber: 7,
      fortnightStart: FORTNIGHT.start,
      documentType: "factura_c",
      number: 3,
      remedy: { kind: "report" },
      actorId: ACTOR,
      ...overrides,
    },
  );
}

describe("remedyRejectedDocument, reporting the document again", () => {
  it("records the remedy for the rejection it remedies at the moment it was asked, and an audit entry naming who chose it and which remedy", async () => {
    const store = setUp();

    const outcome = await remedy(store);

    expect(outcome).toEqual({ kind: "remedied" });
    expect(store.snapshot()).toEqual({
      remedies: [
        {
          pointOfSaleNumber: 7,
          fortnight: FORTNIGHT,
          documentType: "factura_c",
          number: 3,
          remedy: { kind: "report" },
          rejectedAt: REJECTED_AT,
          recordedAt: NOW,
        },
      ],
      audits: [
        {
          pointOfSaleNumber: 7,
          fortnight: FORTNIGHT,
          documentType: "factura_c",
          number: 3,
          kind: "report",
          actorId: ACTOR,
          at: NOW,
          changes: [],
        },
      ],
    });
  });

  it("locks the presentation first, reads its rejection, and writes last, in one transaction, without reading the documents", async () => {
    const store = setUp();

    await remedy(store);

    expect(store.operationOrder).toEqual([
      "holdFortnightPresentation",
      "documentTypeReport",
      "recordRemedy",
      "recordRemedyAudit",
    ]);
    expect(store.heldPresentations).toEqual([KEY]);
    expect(store.transactionCount).toBe(1);
  });

  it.each([
    ["earlier", -1],
    ["later, as after the clock went back", 1],
  ])(
    "remedies again a number the tax authority rejected once more after a remedy recorded for an %s rejection",
    async (_case, offset) => {
      const store = setUp(
        rejection({
          remedy: { number: 3, rejectedAt: new Date(REJECTED_AT.getTime() + offset) },
        }),
      );

      const outcome = await remedy(store);

      expect(outcome.kind).toBe("remedied");
      expect(store.snapshot().remedies.map(({ rejectedAt }) => rejectedAt)).toEqual([REJECTED_AT]);
    },
  );
});

describe("remedyRejectedDocument, correcting a document printed wrong", () => {
  const printed = (correction: Record<string, unknown>) =>
    ({ kind: "printed", correction }) as const;

  it("records the remedy with the correction and an audit entry with the fields changed, their values before and after, and who entered it", async () => {
    const store = setUp();

    const outcome = await remedy(store, {
      remedy: printed({ issuedOn: "2026-09-21", total: 9_900 }),
    });

    const changes = [
      { field: "issuedOn", before: "2026-09-20", after: "2026-09-21" },
      { field: "total", before: 15_000, after: 9_900 },
    ];
    expect(outcome).toEqual({ kind: "remedied" });
    expect(store.snapshot()).toEqual({
      remedies: [
        {
          pointOfSaleNumber: 7,
          fortnight: FORTNIGHT,
          documentType: "factura_c",
          number: 3,
          remedy: printed({ issuedOn: "2026-09-21", total: 9_900 }),
          rejectedAt: REJECTED_AT,
          recordedAt: NOW,
        },
      ],
      audits: [
        {
          pointOfSaleNumber: 7,
          fortnight: FORTNIGHT,
          documentType: "factura_c",
          number: 3,
          kind: "printed",
          actorId: ACTOR,
          at: NOW,
          changes,
        },
      ],
    });
  });

  it("records only the fields that change, dropping the ones the correction repeats", async () => {
    const store = setUp();

    await remedy(store, { remedy: printed({ issuedOn: "2026-09-20", total: 9_900 }) });

    expect(store.snapshot().remedies[0]?.remedy).toEqual(printed({ total: 9_900 }));
  });

  it("keeps what an earlier correction of the document changed and audits the change from what was presented", async () => {
    const store = setUp();
    store.seedDocuments(7, FORTNIGHT, [
      offlineDocument(3, {
        issuedOn: "2026-09-20",
        correction: { issuedOn: "2026-09-19", total: 9_900 },
      }),
    ]);

    const outcome = await remedy(store, { remedy: printed({ total: 9_000 }) });

    expect(outcome).toEqual({ kind: "remedied" });
    expect(store.snapshot().audits[0]?.changes).toEqual([
      { field: "total", before: 9_900, after: 9_000 },
    ]);
    expect(store.snapshot().remedies[0]?.remedy).toEqual(
      printed({ issuedOn: "2026-09-19", total: 9_000 }),
    );
  });

  it("reads the fortnight's documents after the rejection and before writing anything", async () => {
    const store = setUp();

    await remedy(store, { remedy: printed({ total: 9_900 }) });

    expect(store.operationOrder).toEqual([
      "holdFortnightPresentation",
      "documentTypeReport",
      "documentsOn",
      "recordRemedy",
      "recordRemedyAudit",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("refuses a document that is not among the fortnight's, changing nothing", async () => {
    const store = setUp(rejection({ rejectedNumber: 9 }));

    const outcome = await remedy(store, { number: 9, remedy: printed({ total: 9_900 }) });

    expect(outcome).toEqual({ kind: "document_not_found" });
    expect(store.snapshot()).toEqual({ remedies: [], audits: [] });
  });

  it.each([
    ["changes nothing", {}, "nothing_changed"],
    [
      "dates the document outside its fortnight",
      { issuedOn: "2026-10-01" },
      "date_outside_fortnight",
    ],
    [
      "dates it before the number that precedes it",
      { issuedOn: "2026-09-17" },
      "date_out_of_order",
    ],
    ["dates it after the number that follows it", { issuedOn: "2026-09-25" }, "date_out_of_order"],
    ["sets a total of zero", { total: 0 }, "invalid_total"],
    [
      "sets a buyer that does not validate",
      { buyerDocumentType: 96 },
      "invalid_buyer_identification",
    ],
  ])("refuses a correction that %s, changing nothing", async (_case, correction, refusal) => {
    const store = setUp();

    const outcome = await remedy(store, { remedy: printed(correction) });

    expect(outcome).toEqual({ kind: "correction_refused", refusal });
    expect(store.snapshot()).toEqual({ remedies: [], audits: [] });
    expect(store.operationOrder).not.toContain("recordRemedy");
  });

  it("orders the correction against the dates the neighbours are presented with", async () => {
    const store = setUp();
    store.seedDocuments(7, FORTNIGHT, [
      offlineDocument(2, { issuedOn: "2026-09-18", correction: { issuedOn: "2026-09-22" } }),
      offlineDocument(3, { issuedOn: "2026-09-20" }),
    ]);

    const outcome = await remedy(store, { remedy: printed({ issuedOn: "2026-09-21" }) });

    expect(outcome).toEqual({ kind: "correction_refused", refusal: "date_out_of_order" });
  });
});

describe("remedyRejectedDocument, when there is nothing to remedy", () => {
  it.each([
    ["the presentation has no record for that document type", null],
    ["the document type was accepted", rejection({ state: "accepted", rejectedNumber: null })],
    ["the document type was refused whole", rejection({ rejectedNumber: null })],
    ["the rejected document is another number", rejection({ rejectedNumber: 4 })],
    ["the document type is still being submitted", rejection({ state: "submitting" })],
  ])("refuses it as not rejected when %s, changing nothing", async (_case, report) => {
    const store = setUp(report);

    const outcome = await remedy(store);

    expect(outcome).toEqual({ kind: "not_rejected" });
    expect(store.snapshot()).toEqual({ remedies: [], audits: [] });
  });

  it("refuses a rejection whose remedy is already recorded, keeping the first remedy", async () => {
    const store = setUp(rejection({ remedy: { number: 3, rejectedAt: new Date(REJECTED_AT) } }));

    const outcome = await remedy(store);

    expect(outcome).toEqual({ kind: "already_remedied" });
    expect(store.snapshot()).toEqual({ remedies: [], audits: [] });
    expect(store.operationOrder).toEqual(["holdFortnightPresentation", "documentTypeReport"]);
  });

  it("holds the presentation of the fortnight the start belongs to", async () => {
    const store = setUp();

    await remedy(store, { fortnightStart: "2026-09-16" });

    expect(store.heldPresentations).toEqual([
      { pointOfSaleNumber: 7, fortnight: { start: "2026-09-16", end: "2026-09-30" } },
    ]);
  });
});

describe("remedyRejectedDocument, when a write fails", () => {
  it.each(["recordRemedy", "recordRemedyAudit"] as const)(
    "leaves nothing behind when %s fails, and lets the error through",
    async (operation) => {
      const store = setUp();
      store.failingWrites.add(operation);

      await expect(remedy(store)).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot()).toEqual({ remedies: [], audits: [] });
    },
  );
});

describe("remedyRejectedDocument, scoped to the branch", () => {
  it.each([
    ["reporting it again", { kind: "report" } as const],
    ["correcting it", { kind: "printed", correction: { issuedOn: "2026-09-21" } } as const],
  ])(
    "finds no rejection of another branch's point of sale when %s, and records nothing",
    async (_case, chosen) => {
      const store = setUp();

      const outcome = await remedy(store, { locationId: "location-2", remedy: chosen });

      expect(outcome).toEqual({ kind: "not_rejected" });
      expect(store.snapshot()).toEqual({ remedies: [], audits: [] });
    },
  );

  it("remedies the rejection of the branch's own point of sale", async () => {
    const store = setUp();

    expect((await remedy(store)).kind).toBe("remedied");
  });
});
