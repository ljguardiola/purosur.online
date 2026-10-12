import { describe, expect, it } from "vitest";
import {
  fiscalUnknownAlertIsDue,
  fiscalUnknownAlertKey,
  fiscalUnknownAlertLevel,
} from "./fiscal-unknown-alert.js";

const UNCLEAR_SINCE = new Date("2026-10-01T08:00:00.000Z");

function after(minutes: number, milliseconds = 0): Date {
  return new Date(UNCLEAR_SINCE.getTime() + minutes * 60 * 1000 + milliseconds);
}

describe("fiscalUnknownAlertIsDue", () => {
  it("is not due before the document has been unclear for 5 minutes", () => {
    expect(fiscalUnknownAlertIsDue(UNCLEAR_SINCE, after(5, -1))).toBe(false);
    expect(fiscalUnknownAlertIsDue(UNCLEAR_SINCE, UNCLEAR_SINCE)).toBe(false);
  });

  it("is due from the moment the document has been unclear for 5 minutes", () => {
    expect(fiscalUnknownAlertIsDue(UNCLEAR_SINCE, after(5))).toBe(true);
    expect(fiscalUnknownAlertIsDue(UNCLEAR_SINCE, after(100))).toBe(true);
  });
});

describe("fiscalUnknownAlertLevel", () => {
  it("is a warning while the document has been unclear for less than 30 minutes", () => {
    expect(fiscalUnknownAlertLevel(UNCLEAR_SINCE, after(5))).toBe("warning");
    expect(fiscalUnknownAlertLevel(UNCLEAR_SINCE, after(30, -1))).toBe("warning");
  });

  it("is critical once the document has been unclear for 30 minutes", () => {
    expect(fiscalUnknownAlertLevel(UNCLEAR_SINCE, after(30))).toBe("critical");
    expect(fiscalUnknownAlertLevel(UNCLEAR_SINCE, after(200))).toBe("critical");
  });
});

describe("fiscalUnknownAlertKey", () => {
  it("names the unclear-outcome alert scoped to the given document", () => {
    expect(fiscalUnknownAlertKey("document-1")).toEqual({
      kind: "fiscal_unknown",
      scope: "document-1",
    });
  });
});
