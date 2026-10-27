import { describe, expect, it } from "vitest";
import { toWireCreditNote } from "./wire-credit-note";

describe("the credit note a screen is shown", () => {
  it("is still in progress while the credit note is to regularize, until a person settles it", () => {
    expect(toWireCreditNote({ kind: "regularization_required" })).toEqual({ kind: "in_progress" });
  });

  it.each([
    [{ kind: "rejected" }],
    [{ kind: "in_progress" }],
    [{ kind: "already_credited" }],
  ] as const)("keeps %o as it is", (creditNote) => {
    expect(toWireCreditNote(creditNote)).toEqual(creditNote);
  });

  it("is nothing for no credit note", () => {
    expect(toWireCreditNote(null)).toBeNull();
  });
});
