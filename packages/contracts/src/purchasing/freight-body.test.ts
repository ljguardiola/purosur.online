import {
  FREIGHT_CARRIER_NAME_MAX_LENGTH,
  FREIGHT_DESCRIPTION_MAX_LENGTH,
  MAX_CASH_AMOUNT_CENTS,
  MIN_FREIGHT_PURCHASES,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { freightBodySchema } from "./freight-body.js";

const FIRST_PURCHASE = "11111111-1111-1111-1111-111111111111";
const SECOND_PURCHASE = "22222222-2222-2222-2222-222222222222";

const freight = {
  date: "2026-03-09",
  amountCents: 150_000,
  description: "Flete de la entrega de marzo",
  means: { kind: "carrier", name: "Transportes del Sur" },
  purchaseIds: [FIRST_PURCHASE, SECOND_PURCHASE],
};

function firstFailure(body: unknown): { path: unknown[]; message: string } | undefined {
  const result = freightBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

describe("freightBodySchema", () => {
  it("accepts a freight by a carrier linked to several purchases", () => {
    expect(freightBodySchema.safeParse(freight).data).toEqual(freight);
  });

  it("accepts the store's own trip, which carries no name", () => {
    const body = { ...freight, means: { kind: "own_trip" } };
    expect(freightBodySchema.safeParse(body).data).toEqual(body);
  });

  it("reads the purchase ids in lower case", () => {
    const parsed = freightBodySchema.parse({
      ...freight,
      purchaseIds: [FIRST_PURCHASE.replace(/1/g, "A")],
    });
    expect(parsed.purchaseIds).toEqual([FIRST_PURCHASE.replace(/1/g, "a")]);
  });

  it.each([undefined, "", "2026-02-30", "2026-3-9", "09/03/2026", "0000-01-01", 20_260_309])(
    "rejects the date %j",
    (date) => {
      expect(firstFailure({ ...freight, date })).toEqual({
        path: ["date"],
        message: "date must be a calendar day in the form YYYY-MM-DD",
      });
    },
  );

  it.each([undefined, 0, -1, 10.5, "100", MAX_CASH_AMOUNT_CENTS + 1])(
    "rejects the amount %j",
    (amountCents) => {
      expect(firstFailure({ ...freight, amountCents })).toEqual({
        path: ["amountCents"],
        message: "amountCents must be a positive whole number of cents",
      });
    },
  );

  it("accepts the largest cash amount", () => {
    expect(
      freightBodySchema.safeParse({ ...freight, amountCents: MAX_CASH_AMOUNT_CENTS }).success,
    ).toBe(true);
  });

  it("trims the description and accepts one of exactly the domain's maximum length", () => {
    expect(freightBodySchema.parse({ ...freight, description: "  Flete  " }).description).toBe(
      "Flete",
    );
    expect(
      freightBodySchema.safeParse({
        ...freight,
        description: "a".repeat(FREIGHT_DESCRIPTION_MAX_LENGTH),
      }).success,
    ).toBe(true);
  });

  it.each([undefined, "", "   ", "a".repeat(FREIGHT_DESCRIPTION_MAX_LENGTH + 1), 7])(
    "rejects the description %j",
    (description) => {
      expect(firstFailure({ ...freight, description })).toEqual({
        path: ["description"],
        message: `description must be a non-empty string of at most ${FREIGHT_DESCRIPTION_MAX_LENGTH} characters`,
      });
    },
  );

  it("trims a carrier's name and accepts one of exactly the domain's maximum length", () => {
    expect(
      freightBodySchema.parse({ ...freight, means: { kind: "carrier", name: " Sur " } }).means,
    ).toEqual({ kind: "carrier", name: "Sur" });
    expect(
      freightBodySchema.safeParse({
        ...freight,
        means: { kind: "carrier", name: "a".repeat(FREIGHT_CARRIER_NAME_MAX_LENGTH) },
      }).success,
    ).toBe(true);
  });

  it.each([undefined, "", "  ", "a".repeat(FREIGHT_CARRIER_NAME_MAX_LENGTH + 1)])(
    "rejects the carrier name %j",
    (name) => {
      expect(firstFailure({ ...freight, means: { kind: "carrier", name } })).toEqual({
        path: ["means", "name"],
        message: `name must be a non-empty string of at most ${FREIGHT_CARRIER_NAME_MAX_LENGTH} characters`,
      });
    },
  );

  it.each([undefined, null])("rejects the means %j", (means) => {
    expect(firstFailure({ ...freight, means })).toEqual({
      path: ["means"],
      message: "means must be a carrier or the store's own trip",
    });
  });

  it.each([{}, { kind: "ship" }, { kind: "Own_trip" }])("rejects the means %j", (means) => {
    expect(firstFailure({ ...freight, means })).toEqual({
      path: ["means", "kind"],
      message: "means must be a carrier or the store's own trip",
    });
  });

  it.each([undefined, [], "x"])("rejects the purchases %j", (purchaseIds) => {
    expect(firstFailure({ ...freight, purchaseIds })).toEqual({
      path: ["purchaseIds"],
      message: `purchaseIds must be a list of at least ${MIN_FREIGHT_PURCHASES} purchase's id`,
    });
  });

  it("rejects a purchase id that is not an id", () => {
    expect(firstFailure({ ...freight, purchaseIds: [FIRST_PURCHASE, "nope"] })).toEqual({
      path: ["purchaseIds", 1],
      message: "purchaseIds must hold purchases' ids",
    });
  });

  it("rejects a purchase linked twice, whatever the letter case of its id", () => {
    const id = "abcdefab-abcd-abcd-abcd-abcdefabcdef";
    expect(firstFailure({ ...freight, purchaseIds: [id, id.toUpperCase()] })).toEqual({
      path: ["purchaseIds"],
      message: "purchaseIds must not repeat a purchase",
    });
  });
});
