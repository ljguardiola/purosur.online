import { FREIGHT_DESCRIPTION_MAX_LENGTH, FREIGHT_PERIOD_DAYS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { freightListQuerySchema, linkablePurchasesQuerySchema } from "./freight-query.js";

const FREIGHT_ID = "11111111-1111-1111-1111-111111111111";

describe("freightListQuerySchema", () => {
  it.each(FREIGHT_PERIOD_DAYS)("reads the period of %i days from its text", (days) => {
    expect(freightListQuerySchema.parse({ period: String(days) }).period).toBe(days);
  });

  it("falls back to the last 90 days when no period is asked for", () => {
    expect(freightListQuerySchema.parse({}).period).toBe(90);
  });

  it.each(["", "7", "31", "abc", "30.5"])("rejects the period %j", (period) => {
    expect(freightListQuerySchema.safeParse({ period }).success).toBe(false);
  });

  it("trims the search and reads an empty one as none", () => {
    expect(freightListQuerySchema.parse({ search: "  flete " }).search).toBe("flete");
    expect(freightListQuerySchema.parse({ search: "  " }).search).toBeUndefined();
    expect(freightListQuerySchema.parse({}).search).toBeUndefined();
  });

  it("accepts a search of exactly the description's maximum length and rejects a longer one", () => {
    expect(
      freightListQuerySchema.safeParse({ search: "a".repeat(FREIGHT_DESCRIPTION_MAX_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      freightListQuerySchema.safeParse({ search: "a".repeat(FREIGHT_DESCRIPTION_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });
});

describe("the messages of a refused query", () => {
  it("names the search and its limit", () => {
    const result = freightListQuerySchema.safeParse({
      search: "a".repeat(FREIGHT_DESCRIPTION_MAX_LENGTH + 1),
    });

    expect(result.error?.issues[0]?.message).toBe(
      `search must be a string of at most ${FREIGHT_DESCRIPTION_MAX_LENGTH} characters`,
    );
  });

  it("names the freight", () => {
    const result = linkablePurchasesQuerySchema.safeParse({ freightId: "nope" });

    expect(result.error?.issues[0]?.message).toBe("freightId must be a freight's id");
  });
});

describe("linkablePurchasesQuerySchema", () => {
  it("reads the period like the freight list does", () => {
    expect(linkablePurchasesQuerySchema.parse({ period: "90" }).period).toBe(90);
    expect(linkablePurchasesQuerySchema.parse({}).period).toBe(90);
    expect(linkablePurchasesQuerySchema.safeParse({ period: "7" }).success).toBe(false);
  });

  it("reads the freight in lower case, and it is optional", () => {
    expect(
      linkablePurchasesQuerySchema.parse({ freightId: FREIGHT_ID.replace(/1/g, "A") }).freightId,
    ).toBe(FREIGHT_ID.replace(/1/g, "a"));
    expect(linkablePurchasesQuerySchema.parse({}).freightId).toBeUndefined();
  });

  it("rejects a freight that is not an id", () => {
    expect(linkablePurchasesQuerySchema.safeParse({ freightId: "nope" }).success).toBe(false);
  });
});
