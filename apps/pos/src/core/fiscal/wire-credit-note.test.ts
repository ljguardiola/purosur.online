import { describe, expect, it } from "vitest";
import { toWireCreditNote } from "./wire-credit-note";

describe("the credit note a screen is shown", () => {
  it.each([
    [{ kind: "rejected" }],
    [{ kind: "in_progress" }],
    [{ kind: "already_credited" }],
    [{ kind: "regularization_required" }],
  ] as const)("keeps %o as it is", (creditNote) => {
    expect(toWireCreditNote(creditNote)).toEqual(creditNote);
  });

  it("is nothing for no credit note", () => {
    expect(toWireCreditNote(null)).toBeNull();
  });
});
