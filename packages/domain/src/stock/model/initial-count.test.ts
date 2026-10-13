import { describe, expect, it } from "vitest";
import { initialCountCostIncomplete, initialCountOffered } from "./initial-count.js";

describe("initialCountOffered", () => {
  it("is offered while neither the branch nor this register has ever opened a cash session", () => {
    expect(
      initialCountOffered({ branchFirstSessionOpened: false, ownSessionEverOpened: false }),
    ).toBe(true);
  });

  it("is no longer offered once the branch's first cash session has opened", () => {
    expect(
      initialCountOffered({ branchFirstSessionOpened: true, ownSessionEverOpened: false }),
    ).toBe(false);
  });

  it("is no longer offered once this register has opened a cash session", () => {
    expect(
      initialCountOffered({ branchFirstSessionOpened: false, ownSessionEverOpened: true }),
    ).toBe(false);
  });

  it("is not offered when both have opened one", () => {
    expect(
      initialCountOffered({ branchFirstSessionOpened: true, ownSessionEverOpened: true }),
    ).toBe(false);
  });
});

describe("initialCountCostIncomplete", () => {
  it("means a lot with no cost typed yet when asking for the lots without cost", () => {
    expect(initialCountCostIncomplete("incomplete")).toBe(true);
  });

  it("means a lot whose cost has been typed when asking for the lots with a known cost", () => {
    expect(initialCountCostIncomplete("known")).toBe(false);
  });
});
