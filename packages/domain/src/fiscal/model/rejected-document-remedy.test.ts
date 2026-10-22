import { describe, expect, it } from "vitest";
import { FICTIONAL_CUIT } from "../test-support/fictional-tax-identities.js";
import {
  awaitsRemedy,
  buyerIdentificationOf,
  correctionAfter,
  correctionChanges,
  type OfflineDocumentCorrection,
  offlineDocumentBuyerOf,
  offlineDocumentCorrectionRefusal,
  presentedOfflineDocument,
  rejectedDocumentCreditNote,
  remedyAwaitsResend,
} from "./rejected-document-remedy.js";

const FORTNIGHT = { start: "2026-09-16", end: "2026-09-30" };
const CUIT_DIGITS = FICTIONAL_CUIT.replaceAll("-", "");
const CUIT_NUMBER = Number(CUIT_DIGITS);
const CUIT_WITH_WRONG_CHECK_DIGIT = Number(`${CUIT_DIGITS.slice(0, 10)}2`);

function document(number: number, overrides: Partial<PrintedDocument> = {}): PrintedDocument {
  return {
    id: `document-${number}`,
    saleId: `sale-${number}`,
    registerId: "register-1",
    number,
    issuedOn: "2026-09-20",
    total: 15_000,
    netAmount: 15_000,
    buyerDocumentType: 99,
    buyerDocumentNumber: 0,
    buyerTaxStatusCode: 5,
    correction: null,
    ...overrides,
  };
}

interface PrintedDocument {
  id: string;
  saleId: string;
  registerId: string;
  number: number;
  issuedOn: string;
  total: number;
  netAmount: number;
  buyerDocumentType: number;
  buyerDocumentNumber: number;
  buyerTaxStatusCode: number;
  correction: OfflineDocumentCorrection | null;
}

describe("presentedOfflineDocument", () => {
  it("is the document as printed when nothing was corrected", () => {
    const printed = document(4);

    expect(presentedOfflineDocument(printed)).toEqual(printed);
  });

  it("replaces only the fields the correction names and keeps everything else", () => {
    const printed = document(4);

    expect(
      presentedOfflineDocument({ ...printed, correction: { issuedOn: "2026-09-21" } }),
    ).toEqual({ ...printed, issuedOn: "2026-09-21", correction: { issuedOn: "2026-09-21" } });
  });

  it("replaces every field a correction names, the net amount following the total", () => {
    const printed = document(4);
    const correction = {
      issuedOn: "2026-09-18",
      total: 9_900,
      buyerDocumentType: 80,
      buyerDocumentNumber: CUIT_NUMBER,
      buyerTaxStatusCode: 6,
    };

    expect(presentedOfflineDocument({ ...printed, correction })).toEqual({
      ...printed,
      ...correction,
      netAmount: 9_900,
      correction,
    });
  });

  it("keeps the net amount when the correction leaves the total alone", () => {
    const printed = document(4, { total: 8_000, netAmount: 8_000 });

    expect(
      presentedOfflineDocument({ ...printed, correction: { buyerTaxStatusCode: 6 } }).netAmount,
    ).toBe(8_000);
  });
});

describe("offlineDocumentBuyerOf", () => {
  it("is a final consumer for the final consumer's document type and number", () => {
    expect(offlineDocumentBuyerOf({ buyerDocumentType: 99, buyerDocumentNumber: 0 })).toEqual({
      kind: "final_consumer",
    });
  });

  it("is a buyer with a CUIT for the CUIT document type, carrying its number", () => {
    expect(
      offlineDocumentBuyerOf({ buyerDocumentType: 80, buyerDocumentNumber: CUIT_NUMBER }),
    ).toEqual({ kind: "cuit", number: CUIT_NUMBER });
  });

  it("is another buyer for any other document type, and for a final consumer carrying a number", () => {
    expect(offlineDocumentBuyerOf({ buyerDocumentType: 96, buyerDocumentNumber: 1 })).toEqual({
      kind: "other",
    });
    expect(offlineDocumentBuyerOf({ buyerDocumentType: 96, buyerDocumentNumber: 0 })).toEqual({
      kind: "other",
    });
    expect(offlineDocumentBuyerOf({ buyerDocumentType: 99, buyerDocumentNumber: 1 })).toEqual({
      kind: "other",
    });
  });
});

describe("buyerIdentificationOf", () => {
  it("is the final consumer's document type and number for a final consumer", () => {
    expect(buyerIdentificationOf({ kind: "final_consumer" })).toEqual({
      buyerDocumentType: 99,
      buyerDocumentNumber: 0,
    });
  });

  it("is the CUIT document type with the buyer's number for a buyer with a CUIT", () => {
    expect(buyerIdentificationOf({ kind: "cuit", number: CUIT_NUMBER })).toEqual({
      buyerDocumentType: 80,
      buyerDocumentNumber: CUIT_NUMBER,
    });
  });
});

describe("correctionChanges", () => {
  it("lists each field the correction changes with its value before and after, in a fixed order", () => {
    const current = document(4);

    expect(
      correctionChanges(current, {
        buyerTaxStatusCode: 6,
        total: 9_900,
        issuedOn: "2026-09-21",
        buyerDocumentNumber: CUIT_NUMBER,
        buyerDocumentType: 80,
      }),
    ).toEqual([
      { field: "issuedOn", before: "2026-09-20", after: "2026-09-21" },
      { field: "total", before: 15_000, after: 9_900 },
      { field: "buyerDocumentType", before: 99, after: 80 },
      { field: "buyerDocumentNumber", before: 0, after: CUIT_NUMBER },
      { field: "buyerTaxStatusCode", before: 5, after: 6 },
    ]);
  });

  it("leaves out a field the correction repeats and one it does not name", () => {
    expect(correctionChanges(document(4), { issuedOn: "2026-09-20", total: 9_900 })).toEqual([
      { field: "total", before: 15_000, after: 9_900 },
    ]);
  });

  it("is empty for an empty correction", () => {
    expect(correctionChanges(document(4), {})).toEqual([]);
  });
});

describe("correctionAfter", () => {
  it("is the changed fields alone for a document never corrected", () => {
    expect(correctionAfter(null, [{ field: "total", before: 15_000, after: 9_900 }])).toEqual({
      total: 9_900,
    });
  });

  it("keeps what an earlier correction changed and lets the new changes win", () => {
    expect(
      correctionAfter({ issuedOn: "2026-09-18", total: 9_900 }, [
        { field: "total", before: 9_900, after: 9_000 },
        { field: "buyerTaxStatusCode", before: 5, after: 6 },
      ]),
    ).toEqual({ issuedOn: "2026-09-18", total: 9_000, buyerTaxStatusCode: 6 });
  });
});

describe("offlineDocumentCorrectionRefusal", () => {
  const first = document(4, { issuedOn: "2026-09-18" });
  const target = document(5, { issuedOn: "2026-09-20" });
  const last = document(6, { issuedOn: "2026-09-24" });

  function refusal(correction: OfflineDocumentCorrection, documents = [first, target, last]) {
    return offlineDocumentCorrectionRefusal({
      document: target,
      documents,
      correction,
      fortnight: FORTNIGHT,
    });
  }

  it("accepts a correction that changes the date within the fortnight and between its neighbours", () => {
    expect(refusal({ issuedOn: "2026-09-22" })).toBeNull();
  });

  it("refuses a correction that changes nothing", () => {
    expect(refusal({})).toBe("nothing_changed");
    expect(refusal({ issuedOn: "2026-09-20", total: 15_000 })).toBe("nothing_changed");
  });

  it("accepts a date on the first and on the last day of the fortnight when the neighbours allow it", () => {
    const alone = [target];

    expect(refusal({ issuedOn: "2026-09-16" }, alone)).toBeNull();
    expect(refusal({ issuedOn: "2026-09-30" }, alone)).toBeNull();
  });

  it("refuses a date outside the fortnight", () => {
    const alone = [target];

    expect(refusal({ issuedOn: "2026-09-15" }, alone)).toBe("date_outside_fortnight");
    expect(refusal({ issuedOn: "2026-10-01" }, alone)).toBe("date_outside_fortnight");
  });

  it("accepts a date equal to a neighbour's and refuses one before the previous number's or after the next one's", () => {
    expect(refusal({ issuedOn: "2026-09-18" })).toBeNull();
    expect(refusal({ issuedOn: "2026-09-24" })).toBeNull();
    expect(refusal({ issuedOn: "2026-09-17" })).toBe("date_out_of_order");
    expect(refusal({ issuedOn: "2026-09-25" })).toBe("date_out_of_order");
  });

  it("orders against the nearest numbers whatever order the documents come in", () => {
    const farther = document(1, { issuedOn: "2026-09-28" });
    const fartherAhead = document(9, { issuedOn: "2026-09-17" });

    expect(
      refusal({ issuedOn: "2026-09-22" }, [fartherAhead, last, target, first, farther]),
    ).toBeNull();
  });

  it("does not order a document against the dates of the other documents of its type when it has no neighbour on that side", () => {
    expect(refusal({ issuedOn: "2026-09-16" }, [target, last])).toBeNull();
    expect(refusal({ issuedOn: "2026-09-30" }, [first, target])).toBeNull();
  });

  it("refuses a total that is not a positive whole number of cents", () => {
    expect(refusal({ total: 0 })).toBe("invalid_total");
    expect(refusal({ total: -100 })).toBe("invalid_total");
    expect(refusal({ total: 100.5 })).toBe("invalid_total");
    expect(refusal({ total: Number.NaN })).toBe("invalid_total");
    expect(refusal({ total: 1 })).toBeNull();
  });

  it("accepts a buyer identified as a final consumer, and one identified with a valid CUIT", () => {
    const withCuit = document(5, { buyerDocumentType: 80, buyerDocumentNumber: CUIT_NUMBER });

    expect(
      offlineDocumentCorrectionRefusal({
        document: withCuit,
        documents: [withCuit],
        correction: { buyerDocumentType: 99, buyerDocumentNumber: 0 },
        fortnight: FORTNIGHT,
      }),
    ).toBeNull();
    expect(refusal({ buyerDocumentType: 80, buyerDocumentNumber: CUIT_NUMBER })).toBeNull();
  });

  it("refuses a buyer whose CUIT does not validate", () => {
    expect(
      refusal({ buyerDocumentType: 80, buyerDocumentNumber: CUIT_WITH_WRONG_CHECK_DIGIT }),
    ).toBe("invalid_buyer_identification");
  });

  it("refuses a CUIT number with fewer digits than a CUIT, even one that validates once padded with zeros", () => {
    expect(refusal({ buyerDocumentType: 80, buyerDocumentNumber: 1_000_000_007 })).toBe(
      "invalid_buyer_identification",
    );
  });

  it("refuses a final consumer carrying a document number, and a document type the domain has no rule for", () => {
    expect(refusal({ buyerDocumentNumber: 12_345_678 })).toBe("invalid_buyer_identification");
    expect(refusal({ buyerDocumentType: 96, buyerDocumentNumber: 12_345_678 })).toBe(
      "invalid_buyer_identification",
    );
    expect(refusal({ buyerDocumentType: 96, buyerDocumentNumber: CUIT_NUMBER })).toBe(
      "invalid_buyer_identification",
    );
  });

  it("checks the buyer as it will be presented, the fields the correction does not name included", () => {
    const withCuit = document(5, { buyerDocumentType: 80, buyerDocumentNumber: CUIT_NUMBER });

    expect(
      offlineDocumentCorrectionRefusal({
        document: withCuit,
        documents: [withCuit],
        correction: { buyerDocumentType: 99 },
        fortnight: FORTNIGHT,
      }),
    ).toBe("invalid_buyer_identification");
    expect(refusal({ buyerTaxStatusCode: 6 })).toBeNull();
  });

  it("refuses a buyer tax status that is not a positive whole code", () => {
    expect(refusal({ buyerTaxStatusCode: 0 })).toBe("invalid_buyer_identification");
    expect(refusal({ buyerTaxStatusCode: 5.5 })).toBe("invalid_buyer_identification");
  });

  it("does not take a buyer that was already presented for a reason to refuse a correction that leaves the buyer alone", () => {
    const oddBuyer = document(5, { buyerDocumentType: 96, buyerDocumentNumber: 1 });

    expect(
      offlineDocumentCorrectionRefusal({
        document: oddBuyer,
        documents: [oddBuyer],
        correction: { total: 9_000 },
        fortnight: FORTNIGHT,
      }),
    ).toBeNull();
  });

  it("applies the checks in order: nothing changed, the date, the total, the buyer", () => {
    expect(refusal({ issuedOn: "2026-10-05", total: 0, buyerTaxStatusCode: 0 })).toBe(
      "date_outside_fortnight",
    );
    expect(refusal({ total: 0, buyerTaxStatusCode: 0 })).toBe("invalid_total");
  });

  it("compares the new date with the neighbours' presented dates, not the date the correction repeats", () => {
    const corrected = document(5, {
      issuedOn: "2026-09-22",
      correction: { issuedOn: "2026-09-22" },
    });

    expect(
      offlineDocumentCorrectionRefusal({
        document: corrected,
        documents: [first, corrected, last],
        correction: { issuedOn: "2026-09-22" },
        fortnight: FORTNIGHT,
      }),
    ).toBe("nothing_changed");
  });
});

describe("awaitsRemedy", () => {
  const AT = new Date("2026-10-03T15:00:00.000Z");
  const refused = { state: "refused" as const, rejectedNumber: 5, lastAttemptAt: AT };

  it("is true for a refused document type with a rejected number and no remedy", () => {
    expect(awaitsRemedy(refused, null)).toBe(true);
  });

  it("is false once a remedy of that same number was recorded for that rejection", () => {
    expect(awaitsRemedy(refused, { number: 5, rejectedAt: new Date(AT) })).toBe(false);
  });

  it("is true when the remedy of the number was recorded for an earlier or a later rejection of it", () => {
    expect(awaitsRemedy(refused, { number: 5, rejectedAt: new Date(AT.getTime() - 1) })).toBe(true);
    expect(awaitsRemedy(refused, { number: 5, rejectedAt: new Date(AT.getTime() + 1) })).toBe(true);
  });

  it("is true when the remedy recorded for the rejection is for another number", () => {
    expect(awaitsRemedy(refused, { number: 4, rejectedAt: AT })).toBe(true);
  });

  it("is false for a refusal that named no rejected document", () => {
    expect(awaitsRemedy({ ...refused, rejectedNumber: null }, null)).toBe(false);
  });

  it.each(["submitting", "accepted", "missing_document"] as const)(
    "is false for a document type that is %s",
    (state) => {
      expect(awaitsRemedy({ ...refused, state }, null)).toBe(false);
    },
  );

  it("takes a rejection with no recorded attempt as remedied only by a remedy recorded for no attempt either", () => {
    const unattempted = { ...refused, lastAttemptAt: null };

    expect(awaitsRemedy(unattempted, { number: 5, rejectedAt: null })).toBe(false);
    expect(awaitsRemedy(unattempted, { number: 5, rejectedAt: AT })).toBe(true);
    expect(awaitsRemedy(refused, { number: 5, rejectedAt: null })).toBe(true);
  });
});

describe("remedyAwaitsResend", () => {
  const AT = new Date("2026-10-03T15:00:00.000Z");
  const refused = { state: "refused" as const, rejectedNumber: 5, lastAttemptAt: AT };
  const remedy = { number: 5, rejectedAt: new Date(AT) };

  it("is true for a rejected document whose remedy was recorded for that rejection", () => {
    expect(remedyAwaitsResend(refused, remedy)).toBe(true);
  });

  it("is false while the rejected document still awaits its remedy", () => {
    expect(remedyAwaitsResend(refused, null)).toBe(false);
    expect(remedyAwaitsResend(refused, { ...remedy, rejectedAt: new Date(AT.getTime() + 1) })).toBe(
      false,
    );
  });

  it("is false for a refusal with no rejected document, whatever remedy is recorded", () => {
    expect(remedyAwaitsResend({ ...refused, rejectedNumber: null }, remedy)).toBe(false);
  });

  it("is false for a document type that is not refused", () => {
    expect(remedyAwaitsResend({ ...refused, state: "accepted" }, remedy)).toBe(false);
  });
});

describe("rejectedDocumentCreditNote", () => {
  const corrected = document(5, { correction: { total: 9_900, buyerTaxStatusCode: 6 } });

  function decide(overrides: Partial<Parameters<typeof rejectedDocumentCreditNote>[0]> = {}) {
    return rejectedDocumentCreditNote({
      document: corrected,
      offlinePointOfSale: 7,
      realTimePointOfSale: 3,
      reportedThrough: 5,
      ...overrides,
    });
  }

  it("is a credit note for the whole presented total, on the register's real-time point of sale, against the corrected Factura C", () => {
    expect(decide()).toEqual({
      saleId: "sale-5",
      reason: "rejected_document",
      pointOfSale: 3,
      associatedVoucher: { voucherType: 11, pointOfSale: 7, number: 5 },
      total: 9_900,
      receiverTaxStatusCode: 6,
    });
  });

  it("is decided once the tax authority holds numbers beyond the corrected one too", () => {
    expect(decide({ reportedThrough: 9 })).not.toBeNull();
  });

  it("is not decided while the tax authority has not accepted the corrected number", () => {
    expect(decide({ reportedThrough: 4 })).toBeNull();
    expect(decide({ reportedThrough: 0 })).toBeNull();
  });

  it("is not decided for a document that was never corrected", () => {
    expect(decide({ document: { ...corrected, correction: null } })).toBeNull();
  });

  it("is not decided while the register has no real-time point of sale", () => {
    expect(decide({ realTimePointOfSale: null })).toBeNull();
  });

  it("is not decided while nothing of the document's type was reported", () => {
    expect(decide({ reportedThrough: null })).toBeNull();
  });
});
