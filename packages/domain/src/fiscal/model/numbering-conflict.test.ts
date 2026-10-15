import { describe, expect, it } from "vitest";
import {
  decideNumberingReconciliation,
  diagnoseNumberingConflict,
  isNumberingConflict,
  type NumberingReconciliationDocument,
} from "./numbering-conflict.js";

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
