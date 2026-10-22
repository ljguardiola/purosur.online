import { describe, expect, it } from "vitest";
import {
  awaitsNumberingDiagnosis,
  decideNumberingReconciliation,
  diagnoseNumberingConflict,
  isNumberingConflict,
  isNumberingConflictAnswer,
  NUMBERING_CONFLICT_REASK_INTERVAL_MS,
  type NumberingConflictDiagnosis,
  type NumberingReconciliationDocument,
  restorationNumberingFreeze,
} from "./numbering-conflict.js";
import type { RealTimeAuthorizationAnswer } from "./real-time-authorization.js";

describe("numbering conflict policy", () => {
  it("asks again every 30 seconds, as an unclear outcome does", () => {
    expect(NUMBERING_CONFLICT_REASK_INTERVAL_MS).toBe(30_000);
  });
});

describe("isNumberingConflict", () => {
  it("is true when the number-or-date code is among the codes", () => {
    expect(isNumberingConflict([10016])).toBe(true);
    expect(isNumberingConflict([10000, 10016, 600])).toBe(true);
  });

  it("is false for any other codes or none", () => {
    expect(isNumberingConflict([])).toBe(false);
    expect(isNumberingConflict([10015, 10017, 600])).toBe(false);
  });
});

describe("isNumberingConflictAnswer", () => {
  it("is true for an unclear answer carrying the number-or-date code", () => {
    expect(isNumberingConflictAnswer({ answer: { kind: "unclear" }, unclearCodes: [10016] })).toBe(
      true,
    );
  });

  it("is false for an unclear answer without the number-or-date code", () => {
    expect(isNumberingConflictAnswer({ answer: { kind: "unclear" }, unclearCodes: [600] })).toBe(
      false,
    );
  });

  it.each<[string, RealTimeAuthorizationAnswer | null]>([
    ["no answer", null],
    ["an answer not attempted", { kind: "not_attempted" }],
    [
      "an authorized answer",
      {
        kind: "authorized",
        authorizationCode: "75123456789012",
        authorizationCodeDueOn: "2026-10-11",
      },
    ],
    ["a rejected answer", { kind: "rejected", codes: [10016], rejectionClass: "content" }],
  ])("is false for %s, even with the number-or-date code", (_case, answer) => {
    expect(isNumberingConflictAnswer({ answer, unclearCodes: [10016] })).toBe(false);
  });
});

describe("awaitsNumberingDiagnosis", () => {
  const conflict = { answer: { kind: "unclear" } as const, unclearCodes: [10016] };

  it("awaits a diagnosis for a numbering conflict not yet diagnosed", () => {
    expect(awaitsNumberingDiagnosis({ ...conflict, diagnosis: null })).toBe(true);
  });

  it.each<[string, NumberingConflictDiagnosis]>([
    ["a collision", { kind: "collision" }],
    ["a date behind", { kind: "date_behind" }],
  ])("awaits none once diagnosed as %s", (_case, diagnosis) => {
    expect(awaitsNumberingDiagnosis({ ...conflict, diagnosis })).toBe(false);
  });

  it("awaits none for an answer that is not a numbering conflict", () => {
    expect(
      awaitsNumberingDiagnosis({
        answer: { kind: "unclear" },
        unclearCodes: [600],
        diagnosis: null,
      }),
    ).toBe(false);
  });
});

describe("diagnoseNumberingConflict", () => {
  const behind = {
    number: 11,
    issuedOn: "2026-10-01",
    lastAuthorized: 10,
    lastAuthorizedIssuedOn: "2026-10-02",
  };

  it("finds only a date behind when the next number carries an earlier date than the last authorized voucher", () => {
    expect(diagnoseNumberingConflict(behind)).toEqual({ kind: "date_behind" });
  });

  it("finds a collision when the next number carries the same date as the last authorized voucher", () => {
    expect(diagnoseNumberingConflict({ ...behind, issuedOn: "2026-10-02" })).toEqual({
      kind: "collision",
    });
  });

  it("finds a collision when the next number carries a later date", () => {
    expect(diagnoseNumberingConflict({ ...behind, issuedOn: "2026-10-03" })).toEqual({
      kind: "collision",
    });
  });

  it("finds a collision when the number is not the next one", () => {
    expect(diagnoseNumberingConflict({ ...behind, number: 10 })).toEqual({ kind: "collision" });
    expect(diagnoseNumberingConflict({ ...behind, number: 5 })).toEqual({ kind: "collision" });
    expect(diagnoseNumberingConflict({ ...behind, number: 12 })).toEqual({ kind: "collision" });
  });

  it("finds a collision when ARCA holds no voucher at its last authorized number", () => {
    expect(diagnoseNumberingConflict({ ...behind, lastAuthorizedIssuedOn: null })).toEqual({
      kind: "collision",
    });
  });

  it("finds a collision when nothing was ever authorized yet the number is not the first", () => {
    expect(
      diagnoseNumberingConflict({
        number: 3,
        issuedOn: "2026-10-01",
        lastAuthorized: 0,
        lastAuthorizedIssuedOn: null,
      }),
    ).toEqual({ kind: "collision" });
  });
});

describe("decideNumberingReconciliation", () => {
  const document = (
    number: number,
    settlement: NumberingReconciliationDocument["settlement"],
  ): NumberingReconciliationDocument => ({ number, settlement });

  const reconcile = (documents: readonly NumberingReconciliationDocument[]) =>
    decideNumberingReconciliation({ countBeforeFreeze: 10, lastAuthorized: 14, documents });

  it("waits while any document of the range is undecided", () => {
    expect(
      reconcile([
        document(11, "authorized"),
        document(12, "undecided"),
        document(13, "authorized"),
        document(14, "authorized"),
      ]),
    ).toEqual({ kind: "waiting" });
  });

  it("alerts no number when an authorized document accounts for each", () => {
    expect(
      reconcile([
        document(11, "authorized"),
        document(12, "authorized"),
        document(13, "authorized"),
        document(14, "authorized"),
      ]),
    ).toEqual({ kind: "reconciled", lastAuthorized: 14, numbersWithoutOwnDocument: [] });
  });

  it("alerts the numbers with no document", () => {
    expect(reconcile([document(11, "authorized"), document(14, "authorized")])).toEqual({
      kind: "reconciled",
      lastAuthorized: 14,
      numbersWithoutOwnDocument: [12, 13],
    });
  });

  it("alerts a number whose document was released or rejected", () => {
    expect(
      reconcile([
        document(11, "authorized"),
        document(12, "released_or_rejected"),
        document(13, "authorized"),
        document(14, "authorized"),
      ]),
    ).toEqual({ kind: "reconciled", lastAuthorized: 14, numbersWithoutOwnDocument: [12] });
  });

  it("alerts a number whose document is conflicting", () => {
    expect(
      reconcile([
        document(11, "authorized"),
        document(12, "authorized"),
        document(13, "conflicting"),
        document(14, "authorized"),
      ]),
    ).toEqual({ kind: "reconciled", lastAuthorized: 14, numbersWithoutOwnDocument: [13] });
  });

  it("does not alert a number when one of several documents at it is authorized", () => {
    expect(
      reconcile([
        document(11, "released_or_rejected"),
        document(11, "authorized"),
        document(12, "authorized"),
        document(13, "conflicting"),
        document(13, "authorized"),
        document(14, "authorized"),
      ]),
    ).toEqual({ kind: "reconciled", lastAuthorized: 14, numbersWithoutOwnDocument: [] });
  });

  it("lists the alerted numbers in ascending order whatever the order of the documents", () => {
    expect(reconcile([document(14, "conflicting"), document(11, "released_or_rejected")])).toEqual({
      kind: "reconciled",
      lastAuthorized: 14,
      numbersWithoutOwnDocument: [11, 12, 13, 14],
    });
  });

  it("ignores documents outside the range", () => {
    expect(
      decideNumberingReconciliation({
        countBeforeFreeze: 10,
        lastAuthorized: 12,
        documents: [
          document(10, "undecided"),
          document(11, "authorized"),
          document(12, "authorized"),
          document(13, "undecided"),
        ],
      }),
    ).toEqual({ kind: "reconciled", lastAuthorized: 12, numbersWithoutOwnDocument: [] });
  });

  it("reconciles an empty range with nothing to alert", () => {
    expect(
      decideNumberingReconciliation({ countBeforeFreeze: 10, lastAuthorized: 10, documents: [] }),
    ).toEqual({ kind: "reconciled", lastAuthorized: 10, numbersWithoutOwnDocument: [] });
  });

  it("reconciles when ARCA's last authorized number is below the count before the freeze", () => {
    expect(
      decideNumberingReconciliation({ countBeforeFreeze: 10, lastAuthorized: 8, documents: [] }),
    ).toEqual({ kind: "reconciled", lastAuthorized: 8, numbersWithoutOwnDocument: [] });
  });
});

describe("restorationNumberingFreeze", () => {
  const frozenAt = new Date("2026-03-04T10:00:00.000Z");

  it("freezes at the count the cloud holds", () => {
    expect(restorationNumberingFreeze(25, frozenAt)).toEqual({
      countBeforeFreeze: 25,
      frozenAt,
    });
  });

  it("freezes at a held count of zero", () => {
    expect(restorationNumberingFreeze(0, frozenAt)).toEqual({ countBeforeFreeze: 0, frozenAt });
  });

  it("does not freeze when the cloud holds no count, so a sweep never starts from zero", () => {
    expect(restorationNumberingFreeze(null, frozenAt)).toBeNull();
  });
});
