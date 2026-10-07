import { describe, expect, it } from "vitest";
import { nextBuyerTaxStatusFetchAt } from "./buyer-tax-status-fetch.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");

describe("nextBuyerTaxStatusFetchAt", () => {
  it("fetches again an hour after a fetch that got a set from ARCA", () => {
    expect(nextBuyerTaxStatusFetchAt({ gotSet: true }, NOW)).toEqual(
      new Date("2026-10-01T13:00:00.000Z"),
    );
  });

  it("fetches again a minute after a fetch that could not get a set", () => {
    expect(nextBuyerTaxStatusFetchAt({ gotSet: false }, NOW)).toEqual(
      new Date("2026-10-01T12:01:00.000Z"),
    );
  });
});
