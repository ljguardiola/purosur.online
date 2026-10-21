import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { shiftCalendarDay } from "../../shared/index.js";
import {
  documentTypePresentationState,
  type FortnightReportState,
  fortnightClosesAt,
  fortnightPresentationRows,
  fortnightReportDeadline,
  fortnightReportStanding,
  fortnightReportStateOfDocumentTypes,
  isFortnightPresentationOwed,
  isFortnightReportOutstanding,
  isFortnightReportRetryDue,
  isOfflineDocumentReported,
  nextOfflineDocumentBatch,
  offlineDocumentPresentations,
  owedFortnightPresentationState,
  owesFortnightReport,
  remedyForUnreportedDocuments,
} from "./fortnight-report.js";
import { fortnightContaining } from "./offline-authorization-code.js";

const anyDay = fc
  .date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z") })
  .filter((date) => !Number.isNaN(date.getTime()))
  .map((date) => date.toISOString().slice(0, 10));

const anyFortnight = anyDay.map(fortnightContaining);

const FIRST_HALF = { start: "2026-09-01", end: "2026-09-15" };

describe("fortnightClosesAt", () => {
  it("is midnight, Argentina time, at the start of the day after the fortnight's last day", () => {
    expect(fortnightClosesAt(FIRST_HALF)).toEqual(new Date("2026-09-16T03:00:00.000Z"));
  });

  it("rolls over a month and a year end", () => {
    expect(fortnightClosesAt({ start: "2026-12-16", end: "2026-12-31" })).toEqual(
      new Date("2027-01-01T03:00:00.000Z"),
    );
  });
});

describe("fortnightReportDeadline", () => {
  it("is the eighth day after the fortnight closes when the tax authority's own deadline is later", () => {
    expect(fortnightReportDeadline(FIRST_HALF, "2026-09-30")).toBe("2026-09-23");
  });

  it("is the tax authority's own deadline when it comes first", () => {
    expect(fortnightReportDeadline(FIRST_HALF, "2026-09-20")).toBe("2026-09-20");
  });

  it("is that day when both coincide", () => {
    expect(fortnightReportDeadline(FIRST_HALF, "2026-09-23")).toBe("2026-09-23");
  });

  it("is the earlier of the two for every fortnight and tax authority deadline", () => {
    fc.assert(
      fc.property(anyFortnight, anyDay, (fortnight, own) => {
        const eighth = shiftCalendarDay(fortnight.end, 8);
        expect(fortnightReportDeadline(fortnight, own)).toBe(own < eighth ? own : eighth);
      }),
    );
  });
});

describe("fortnightReportStanding", () => {
  const report = (state: FortnightReportState | null) => ({
    fortnight: FIRST_HALF,
    deadline: "2026-09-23",
    state,
  });

  it("is not due while the fortnight is still running, its last day included", () => {
    expect(fortnightReportStanding(report(null), "2026-09-10")).toEqual({ kind: "not_due" });
    expect(fortnightReportStanding(report("blocked"), "2026-09-15")).toEqual({ kind: "not_due" });
  });

  it("is not due once accepted, before or after its deadline", () => {
    expect(fortnightReportStanding(report("accepted"), "2026-09-20")).toEqual({ kind: "not_due" });
    expect(fortnightReportStanding(report("accepted"), "2026-10-20")).toEqual({ kind: "not_due" });
  });

  it("is not due once marked for manual regularization, before or after its deadline", () => {
    expect(fortnightReportStanding(report("needs_regularization"), "2026-09-20")).toEqual({
      kind: "not_due",
    });
    expect(fortnightReportStanding(report("needs_regularization"), "2026-10-20")).toEqual({
      kind: "not_due",
    });
  });

  it("is pending with the days left to its deadline from the day after the fortnight closes", () => {
    expect(fortnightReportStanding(report(null), "2026-09-16")).toEqual({
      kind: "pending",
      daysLeft: 7,
      pressing: false,
    });
  });

  it("is pressing the day before the deadline and on the deadline itself", () => {
    expect(fortnightReportStanding(report(null), "2026-09-21")).toEqual({
      kind: "pending",
      daysLeft: 2,
      pressing: false,
    });
    expect(fortnightReportStanding(report(null), "2026-09-22")).toEqual({
      kind: "pending",
      daysLeft: 1,
      pressing: true,
    });
    expect(fortnightReportStanding(report("refused"), "2026-09-23")).toEqual({
      kind: "pending",
      daysLeft: 0,
      pressing: true,
    });
  });

  it("is pending with no stored state or whatever the stored state that is not accepted", () => {
    for (const state of [null, "blocked", "submitting", "refused"] as const) {
      expect(fortnightReportStanding(report(state), "2026-09-18").kind).toBe("pending");
    }
  });

  it("is missed from the day after the deadline, with no stored state or whatever the stored state that is not accepted", () => {
    for (const state of [null, "blocked", "submitting", "refused"] as const) {
      expect(fortnightReportStanding(report(state), "2026-09-24")).toEqual({ kind: "missed" });
    }
  });

  it("is one of the three standings, decided by the day alone, for every day", () => {
    fc.assert(
      fc.property(anyFortnight, anyDay, (fortnight, today) => {
        const deadline = shiftCalendarDay(fortnight.end, 8);
        const standing = fortnightReportStanding({ fortnight, deadline, state: null }, today);
        if (today <= fortnight.end) {
          expect(standing).toEqual({ kind: "not_due" });
        } else if (today <= deadline) {
          expect(standing.kind).toBe("pending");
        } else {
          expect(standing).toEqual({ kind: "missed" });
        }
      }),
    );
  });
});

describe("owesFortnightReport", () => {
  const claimedBeforeClose = new Date("2026-09-10T12:00:00.000Z");

  it("is owed from the day after the fortnight closes by a point of sale claimed before its close", () => {
    expect(
      owesFortnightReport({ fortnight: FIRST_HALF, claimedAt: claimedBeforeClose }, "2026-09-16"),
    ).toBe(true);
    expect(
      owesFortnightReport({ fortnight: FIRST_HALF, claimedAt: claimedBeforeClose }, "2026-10-30"),
    ).toBe(true);
  });

  it("is not owed while the fortnight is still running, its last day included", () => {
    expect(
      owesFortnightReport({ fortnight: FIRST_HALF, claimedAt: claimedBeforeClose }, "2026-09-15"),
    ).toBe(false);
  });

  it("is owed by a point of sale claimed just before the fortnight closes, and not by one claimed at its close or after", () => {
    const owedWhenClaimedAt = (claimedAt: string) =>
      owesFortnightReport({ fortnight: FIRST_HALF, claimedAt: new Date(claimedAt) }, "2026-09-20");

    expect(owedWhenClaimedAt("2026-09-16T02:59:59.999Z")).toBe(true);
    expect(owedWhenClaimedAt("2026-09-16T03:00:00.000Z")).toBe(false);
    expect(owedWhenClaimedAt("2026-09-18T12:00:00.000Z")).toBe(false);
  });

  it("is owed by a listed presentation whenever the point of sale was claimed, once the fortnight closed", () => {
    const claimedAfterClose = new Date("2026-09-18T12:00:00.000Z");

    expect(
      owesFortnightReport(
        { fortnight: FIRST_HALF, claimedAt: claimedAfterClose, listed: true },
        "2026-09-20",
      ),
    ).toBe(true);
    expect(
      owesFortnightReport(
        { fortnight: FIRST_HALF, claimedAt: claimedAfterClose, listed: false },
        "2026-09-20",
      ),
    ).toBe(false);
  });

  it("is not owed by a listed presentation while the fortnight is still running", () => {
    expect(
      owesFortnightReport(
        { fortnight: FIRST_HALF, claimedAt: claimedBeforeClose, listed: true },
        "2026-09-15",
      ),
    ).toBe(false);
  });
});

describe("owesFortnightReport of a retired point of sale", () => {
  const claimedAt = new Date("2026-08-01T12:00:00.000Z");
  const closesAt = "2026-09-16T03:00:00.000Z";
  const owedRetiredAt = (retiredAt: string, listed = false) =>
    owesFortnightReport(
      { fortnight: FIRST_HALF, claimedAt, retiredAt: new Date(retiredAt), listed },
      "2026-10-30",
    );

  it("still owes a fortnight that closed before the retirement", () => {
    expect(owedRetiredAt("2026-09-20T12:00:00.000Z")).toBe(true);
  });

  it("still owes a fortnight that closed at the very instant of the retirement", () => {
    expect(owedRetiredAt(closesAt)).toBe(true);
  });

  it("owes no fortnight that closes after the retirement", () => {
    expect(owedRetiredAt("2026-09-16T02:59:59.999Z")).toBe(false);
    expect(owedRetiredAt("2026-09-05T12:00:00.000Z")).toBe(false);
  });

  it("owes a fortnight the tax authority lists as owed even when it closes after the retirement", () => {
    expect(owedRetiredAt("2026-09-05T12:00:00.000Z", true)).toBe(true);
  });

  it("owes nothing of a fortnight still running, listed or not", () => {
    expect(
      owesFortnightReport(
        { fortnight: FIRST_HALF, claimedAt, retiredAt: new Date("2026-09-05T12:00:00.000Z") },
        "2026-09-15",
      ),
    ).toBe(false);
    expect(
      owesFortnightReport(
        {
          fortnight: FIRST_HALF,
          claimedAt,
          retiredAt: new Date("2026-09-05T12:00:00.000Z"),
          listed: true,
        },
        "2026-09-15",
      ),
    ).toBe(false);
  });

  it("owes no fortnight that closed before its claim, retired or not", () => {
    expect(
      owesFortnightReport(
        {
          fortnight: FIRST_HALF,
          claimedAt: new Date("2026-09-18T12:00:00.000Z"),
          retiredAt: new Date("2026-09-30T12:00:00.000Z"),
        },
        "2026-10-30",
      ),
    ).toBe(false);
  });
});

describe("isFortnightReportOutstanding", () => {
  it.each([null, "blocked", "missing_document", "submitting", "refused"] as const)(
    "is outstanding with the stored state %s",
    (state) => {
      expect(isFortnightReportOutstanding(state)).toBe(true);
    },
  );

  it("is no longer outstanding once accepted", () => {
    expect(isFortnightReportOutstanding("accepted")).toBe(false);
  });

  it("is no longer outstanding once marked for manual regularization", () => {
    expect(isFortnightReportOutstanding("needs_regularization")).toBe(false);
  });
});

describe("remedyForUnreportedDocuments", () => {
  it("reports the rest of a fortnight already accepted with documents", () => {
    expect(remedyForUnreportedDocuments("documents")).toBe("report_the_rest");
  });

  it("leaves a fortnight already accepted as having no movement to manual regularization", () => {
    expect(remedyForUnreportedDocuments("none")).toBe("manual_regularization");
  });
});

describe("isOfflineDocumentReported", () => {
  it("is reported up to the last number its presentation reported, that number included", () => {
    expect(isOfflineDocumentReported(41, 42)).toBe(true);
    expect(isOfflineDocumentReported(42, 42)).toBe(true);
  });

  it("is not reported past that number", () => {
    expect(isOfflineDocumentReported(43, 42)).toBe(false);
  });

  it("is not reported while its presentation reported nothing", () => {
    expect(isOfflineDocumentReported(1, null)).toBe(false);
  });
});

describe("offlineDocumentPresentations", () => {
  it("is one presentation per document type, each with its documents in number order", () => {
    const documents = [
      { documentType: "nota_de_credito_c", number: 4 },
      { documentType: "factura_c", number: 12 },
      { documentType: "nota_de_debito_c", number: 1 },
      { documentType: "factura_c", number: 11 },
      { documentType: "nota_de_credito_c", number: 3 },
    ];

    expect(offlineDocumentPresentations(documents)).toEqual([
      {
        documentType: "factura_c",
        documents: [
          { documentType: "factura_c", number: 11 },
          { documentType: "factura_c", number: 12 },
        ],
      },
      {
        documentType: "nota_de_credito_c",
        documents: [
          { documentType: "nota_de_credito_c", number: 3 },
          { documentType: "nota_de_credito_c", number: 4 },
        ],
      },
      {
        documentType: "nota_de_debito_c",
        documents: [{ documentType: "nota_de_debito_c", number: 1 }],
      },
    ]);
  });

  it("is no presentation at all without documents", () => {
    expect(offlineDocumentPresentations([])).toEqual([]);
  });

  it("orders the presentations by document type alphabetically, whatever the case of its letters", () => {
    expect(
      offlineDocumentPresentations([
        { documentType: "B", number: 1 },
        { documentType: "a", number: 1 },
      ]).map(({ documentType }) => documentType),
    ).toEqual(["a", "B"]);
  });

  it("never mixes document types and keeps every document, for every set of documents", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            documentType: fc.constantFrom("factura_c", "nota_de_credito_c", "nota_de_debito_c"),
            number: fc.integer({ min: 1, max: 99_999_999 }),
          }),
          { selector: ({ documentType, number }) => `${documentType}:${number}` },
        ),
        (documents) => {
          const presentations = offlineDocumentPresentations(documents);
          for (const { documentType, documents: presented } of presentations) {
            expect(presented.every((document) => document.documentType === documentType)).toBe(
              true,
            );
            expect(presented.map(({ number }) => number)).toEqual(
              presented.map(({ number }) => number).sort((left, right) => left - right),
            );
          }
          expect(new Set(presentations.map(({ documentType }) => documentType)).size).toBe(
            presentations.length,
          );
          expect(presentations.flatMap(({ documents: presented }) => presented)).toHaveLength(
            documents.length,
          );
        },
      ),
    );
  });
});

describe("nextOfflineDocumentBatch", () => {
  const numbered = (...numbers: number[]) => numbers.map((number) => ({ number }));

  it("is every document past the last one the tax authority holds, up to the batch limit", () => {
    expect(nextOfflineDocumentBatch(numbered(41, 42, 43, 44, 45), 41, 3)).toEqual({
      kind: "batch",
      documents: numbered(42, 43, 44),
    });
  });

  it("is the whole rest when it fits the batch limit", () => {
    expect(nextOfflineDocumentBatch(numbered(1, 2), 0, 250)).toEqual({
      kind: "batch",
      documents: numbered(1, 2),
    });
  });

  it("is nothing left once the tax authority holds every document", () => {
    expect(nextOfflineDocumentBatch(numbered(41, 42), 42, 3)).toEqual({ kind: "all_reported" });
    expect(nextOfflineDocumentBatch(numbered(41, 42), 50, 3)).toEqual({ kind: "all_reported" });
  });

  it("is a gap when the next document the tax authority expects is missing", () => {
    expect(nextOfflineDocumentBatch(numbered(44, 45), 41, 3)).toEqual({
      kind: "gap",
      expectedNumber: 42,
    });
  });

  it("stops before a missing number inside the documents", () => {
    expect(nextOfflineDocumentBatch(numbered(42, 43, 45, 46), 41, 10)).toEqual({
      kind: "batch",
      documents: numbered(42, 43),
    });
  });

  it("is a contiguous run starting right after the tax authority's last number and never longer than the limit, for every set of documents", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 300 })),
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 1, max: 50 }),
        (numbers, lastReported, limit) => {
          const documents = numbered(...[...numbers].sort((left, right) => left - right));
          const batch = nextOfflineDocumentBatch(documents, lastReported, limit);
          const pending = numbers.filter((number) => number > lastReported);
          if (pending.length === 0) {
            expect(batch).toEqual({ kind: "all_reported" });
          } else if (!pending.includes(lastReported + 1)) {
            expect(batch).toEqual({ kind: "gap", expectedNumber: lastReported + 1 });
          } else {
            if (batch.kind !== "batch") {
              throw new Error(`expected a batch, got ${batch.kind}`);
            }
            expect(batch.documents.length).toBeGreaterThan(0);
            expect(batch.documents.length).toBeLessThanOrEqual(limit);
            batch.documents.forEach(({ number }, index) => {
              expect(number).toBe(lastReported + 1 + index);
            });
          }
        },
      ),
    );
  });
});

describe("fortnightReportStateOfDocumentTypes", () => {
  it("is accepted once every document type is accepted", () => {
    expect(fortnightReportStateOfDocumentTypes(["accepted", "accepted"])).toBe("accepted");
  });

  it("is refused while any document type is refused", () => {
    expect(fortnightReportStateOfDocumentTypes(["accepted", "missing_document", "refused"])).toBe(
      "refused",
    );
  });

  it("is missing a document while any document type misses one from its series and none is refused", () => {
    expect(
      fortnightReportStateOfDocumentTypes(["submitting", "missing_document", "accepted"]),
    ).toBe("missing_document");
  });

  it("is submitting while any document type is still awaiting an answer", () => {
    expect(fortnightReportStateOfDocumentTypes(["accepted", "submitting"])).toBe("submitting");
  });
});

describe("documentTypePresentationState", () => {
  it("is the state recorded for the document type", () => {
    expect(documentTypePresentationState("submitting", "blocked")).toBe("submitting");
    expect(documentTypePresentationState("accepted", null)).toBe("accepted");
  });

  it("is blocked, with nothing recorded for the document type, when the fortnight's report is blocked", () => {
    expect(documentTypePresentationState(null, "blocked")).toBe("blocked");
  });

  it.each(["submitting", "refused", "accepted", "needs_regularization", null] as const)(
    "is none, with nothing recorded for the document type, when the fortnight's report is %s",
    (fortnightState) => {
      expect(documentTypePresentationState(null, fortnightState)).toBeNull();
    },
  );
});

describe("fortnightPresentationRows", () => {
  const document = (documentType: string, number: number) => ({ documentType, number });
  const noRecord = { movement: null, refusal: null, rejectedDocument: null } as const;

  it("is one row without a document type, declaring no movement, when the fortnight issued no documents and was accepted", () => {
    expect(
      fortnightPresentationRows({
        state: "accepted",
        movement: "none",
        documents: [],
        documentReports: [],
      }),
    ).toEqual([
      { ...noRecord, documentType: null, state: "accepted", documentCount: 0, movement: "none" },
    ]);
  });

  it("is one row without a document type, declaring nothing yet, while nothing was recorded for a fortnight without documents", () => {
    expect(
      fortnightPresentationRows({
        state: null,
        movement: null,
        documents: [],
        documentReports: [],
      }),
    ).toEqual([{ ...noRecord, documentType: null, state: null, documentCount: 0 }]);
  });

  it("is one row without a document type, declaring no movement and counting the documents that arrived late, when the fortnight needs regularization", () => {
    expect(
      fortnightPresentationRows({
        state: "needs_regularization",
        movement: null,
        documents: [document("factura_c", 1), document("factura_c", 2), document("nota_c", 1)],
        documentReports: [
          {
            documentType: "factura_c",
            state: "accepted",
            reportedThrough: 2,
            rejectedNumber: null,
          },
        ],
      }),
    ).toEqual([
      {
        ...noRecord,
        documentType: null,
        movement: "none",
        state: "needs_regularization",
        documentCount: 3,
      },
    ]);
  });

  it("is one row per document type that had documents, declaring them, counting them and ordered by document type", () => {
    expect(
      fortnightPresentationRows({
        state: "submitting",
        movement: null,
        documents: [document("nota_c", 4), document("factura_c", 9), document("factura_c", 8)],
        documentReports: [
          {
            documentType: "factura_c",
            state: "accepted",
            reportedThrough: 9,
            rejectedNumber: null,
          },
        ],
      }),
    ).toEqual([
      {
        ...noRecord,
        documentType: "factura_c",
        movement: "documents",
        state: "accepted",
        documentCount: 2,
      },
      { ...noRecord, documentType: "nota_c", movement: "documents", state: null, documentCount: 1 },
    ]);
  });

  it("blocks the document types with nothing recorded when the fortnight's report is blocked", () => {
    expect(
      fortnightPresentationRows({
        state: "blocked",
        movement: null,
        documents: [document("factura_c", 1), document("nota_c", 1)],
        documentReports: [
          { documentType: "nota_c", state: "submitting", reportedThrough: 0, rejectedNumber: null },
        ],
      }).map(({ documentType, state }) => [documentType, state]),
    ).toEqual([
      ["factura_c", "blocked"],
      ["nota_c", "submitting"],
    ]);
  });

  it("names the document the tax authority rejected and how many of its type come after it", () => {
    expect(
      fortnightPresentationRows({
        state: "refused",
        movement: null,
        documents: [1, 2, 3, 4, 5]
          .map((number) => document("factura_c", number))
          .concat(document("nota_c", 9)),
        documentReports: [
          { documentType: "factura_c", state: "refused", reportedThrough: 1, rejectedNumber: 2 },
        ],
      }),
    ).toEqual([
      {
        documentType: "factura_c",
        movement: "documents",
        state: "refused",
        refusal: "partial",
        documentCount: 5,
        rejectedDocument: { number: 2, unprocessed: 3 },
      },
      { ...noRecord, documentType: "nota_c", movement: "documents", state: null, documentCount: 1 },
    ]);
  });

  it("leaves none unprocessed when the rejected document is the last of its type", () => {
    const [row] = fortnightPresentationRows({
      state: "refused",
      movement: null,
      documents: [document("factura_c", 1), document("factura_c", 2)],
      documentReports: [
        { documentType: "factura_c", state: "refused", reportedThrough: 1, rejectedNumber: 2 },
      ],
    });

    expect(row?.rejectedDocument).toEqual({ number: 2, unprocessed: 0 });
  });

  it("names no rejected document for a refusal that rejected none, nor for a retry after one", () => {
    const rows = (state: "refused" | "submitting", rejectedNumber: number | null) =>
      fortnightPresentationRows({
        state: "submitting",
        movement: null,
        documents: [document("factura_c", 1), document("factura_c", 2)],
        documentReports: [{ documentType: "factura_c", state, reportedThrough: 0, rejectedNumber }],
      });

    expect(rows("refused", null)[0]?.rejectedDocument).toBeNull();
    expect(rows("submitting", null)[0]?.rejectedDocument).toBeNull();
  });

  describe("a presentation the tax authority lists as owed", () => {
    it("shows an accepted fortnight without documents as listed as owed, keeping what it declared", () => {
      expect(
        fortnightPresentationRows({
          state: "accepted",
          movement: "none",
          documents: [],
          documentReports: [],
          listedAsOwed: true,
        }),
      ).toEqual([
        {
          ...noRecord,
          documentType: null,
          state: "listed_as_owed",
          documentCount: 0,
          movement: "none",
        },
      ]);
    });

    it("shows each accepted document type as listed as owed and leaves the others as they are", () => {
      expect(
        fortnightPresentationRows({
          state: "submitting",
          movement: null,
          documents: [document("factura_c", 9), document("nota_c", 4)],
          documentReports: [
            {
              documentType: "factura_c",
              state: "accepted",
              reportedThrough: 9,
              rejectedNumber: null,
            },
          ],
          listedAsOwed: true,
        }).map(({ documentType, state }) => [documentType, state]),
      ).toEqual([
        ["factura_c", "listed_as_owed"],
        ["nota_c", null],
      ]);
    });

    it.each([
      null,
      "blocked",
      "refused",
      "submitting",
      "missing_document",
      "needs_regularization",
    ] as const)("keeps a fortnight without documents whose report is %s as it is", (state) => {
      expect(
        fortnightPresentationRows({
          state,
          movement: null,
          documents: [],
          documentReports: [],
          listedAsOwed: true,
        })[0]?.state,
      ).toBe(state);
    });

    it("keeps an accepted fortnight as accepted when the tax authority does not list it", () => {
      expect(
        fortnightPresentationRows({
          state: "accepted",
          movement: "none",
          documents: [],
          documentReports: [],
          listedAsOwed: false,
        })[0]?.state,
      ).toBe("accepted");
    });
  });

  describe("how a refusal is meant", () => {
    const refusalOf = (
      numbers: number[],
      answer: { reportedThrough: number; rejectedNumber: number | null },
    ) =>
      fortnightPresentationRows({
        state: "refused",
        movement: null,
        documents: numbers.map((number) => document("factura_c", number)),
        documentReports: [{ documentType: "factura_c", state: "refused", ...answer }],
      })[0]?.refusal;

    it("is partial when the tax authority rejected a document after accepting an earlier one of the presentation", () => {
      expect(refusalOf([4, 5, 6], { reportedThrough: 4, rejectedNumber: 5 })).toBe("partial");
    });

    it("is partial when the tax authority refused a batch whole after accepting an earlier batch of the presentation", () => {
      expect(refusalOf([1, 2, 3], { reportedThrough: 2, rejectedNumber: null })).toBe("partial");
    });

    it("is whole when the tax authority rejected the presentation's first document", () => {
      expect(refusalOf([4, 5, 6], { reportedThrough: 3, rejectedNumber: 4 })).toBe("whole");
    });

    it("is whole when the presentation's only document was rejected", () => {
      expect(refusalOf([4], { reportedThrough: 3, rejectedNumber: 4 })).toBe("whole");
    });

    it("is whole when the tax authority refused the presentation's first batch without naming a document", () => {
      expect(refusalOf([4, 5], { reportedThrough: 3, rejectedNumber: null })).toBe("whole");
    });

    it("is whole for a refused declaration of no movement", () => {
      expect(
        fortnightPresentationRows({
          state: "refused",
          movement: null,
          documents: [],
          documentReports: [],
        })[0]?.refusal,
      ).toBe("whole");
    });

    it.each(["submitting", "accepted", "missing_document"] as const)(
      "is none for a document type that is %s",
      (state) => {
        expect(
          fortnightPresentationRows({
            state: "refused",
            movement: null,
            documents: [document("factura_c", 4), document("factura_c", 5)],
            documentReports: [
              { documentType: "factura_c", state, reportedThrough: 4, rejectedNumber: 5 },
            ],
          })[0]?.refusal,
        ).toBeNull();
      },
    );

    it.each([null, "blocked", "submitting", "accepted", "needs_regularization"] as const)(
      "is none for a fortnight without documents whose report is %s",
      (state) => {
        expect(
          fortnightPresentationRows({
            state,
            movement: null,
            documents: [],
            documentReports: [],
          })[0]?.refusal,
        ).toBeNull();
      },
    );
  });
});

describe("isFortnightReportRetryDue", () => {
  const lastAttemptAt = new Date("2026-09-16T12:00:00.000Z");

  it("is not due before the interval has passed", () => {
    expect(isFortnightReportRetryDue(lastAttemptAt, new Date("2026-09-16T12:59:59.999Z"))).toBe(
      false,
    );
  });

  it("is due once the interval has passed exactly", () => {
    expect(isFortnightReportRetryDue(lastAttemptAt, new Date("2026-09-16T13:00:00.000Z"))).toBe(
      true,
    );
  });

  it("is due long after", () => {
    expect(isFortnightReportRetryDue(lastAttemptAt, new Date("2026-09-20T00:00:00.000Z"))).toBe(
      true,
    );
  });
});

describe("isFortnightPresentationOwed", () => {
  it.each([null, "blocked", "missing_document", "submitting", "refused"] as const)(
    "is owed while its report is %s, whether the tax authority lists it or not",
    (state) => {
      expect(isFortnightPresentationOwed({ state, listed: false })).toBe(true);
      expect(isFortnightPresentationOwed({ state, listed: true })).toBe(true);
    },
  );

  it.each(["accepted", "needs_regularization"] as const)(
    "is no longer owed once %s, while the tax authority does not list it",
    (state) => {
      expect(isFortnightPresentationOwed({ state, listed: false })).toBe(false);
    },
  );

  it.each(["accepted", "needs_regularization"] as const)(
    "is owed again although %s, once the tax authority lists it",
    (state) => {
      expect(isFortnightPresentationOwed({ state, listed: true })).toBe(true);
    },
  );
});

describe("owedFortnightPresentationState", () => {
  it("forgets an accepted report the tax authority's list contradicts", () => {
    expect(owedFortnightPresentationState({ state: "accepted", listed: true })).toBeNull();
  });

  it.each([
    null,
    "blocked",
    "missing_document",
    "submitting",
    "refused",
    "needs_regularization",
  ] as const)("keeps a listed report that is %s", (state) => {
    expect(owedFortnightPresentationState({ state, listed: true })).toBe(state);
  });

  it.each([
    null,
    "blocked",
    "missing_document",
    "submitting",
    "refused",
    "accepted",
    "needs_regularization",
  ] as const)("keeps a report the tax authority does not list that is %s", (state) => {
    expect(owedFortnightPresentationState({ state, listed: false })).toBe(state);
  });
});
