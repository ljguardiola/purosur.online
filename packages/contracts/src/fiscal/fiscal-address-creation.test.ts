import {
  FISCAL_ADDRESS_NAME_MAX_LENGTH,
  FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { fiscalAddressCreationBodySchema } from "./fiscal-address-creation.js";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { name: "Depósito Central", street_address: "Calle Ficticia 123, CABA", ...overrides };
}

function firstFailure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = fiscalAddressCreationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

function textFailure(field: string, maxLength: number) {
  return {
    field,
    message: `${field} must be a non-empty string of at most ${maxLength} characters`,
  };
}

const nameFailure = textFailure("name", FISCAL_ADDRESS_NAME_MAX_LENGTH);
const streetAddressFailure = textFailure(
  "street_address",
  FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH,
);

describe("fiscalAddressCreationBodySchema", () => {
  it("reads the name and the street address, trimmed", () => {
    const result = fiscalAddressCreationBodySchema.safeParse(
      validBody({ name: "  Depósito Central ", street_address: " Calle Ficticia 123, CABA  " }),
    );

    expect(result.data).toEqual({
      name: "Depósito Central",
      street_address: "Calle Ficticia 123, CABA",
    });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j", (name) => {
    expect(firstFailure(validBody({ name }))).toEqual(nameFailure);
  });

  it("accepts a name of exactly the maximum length and rejects one character more", () => {
    const atLimit = "a".repeat(FISCAL_ADDRESS_NAME_MAX_LENGTH);

    expect(firstFailure(validBody({ name: atLimit }))).toBeUndefined();
    expect(firstFailure(validBody({ name: `${atLimit}a` }))).toEqual(nameFailure);
  });

  it.each([undefined, "", "   ", 42, null])("rejects the street address %j", (street_address) => {
    expect(firstFailure(validBody({ street_address }))).toEqual(streetAddressFailure);
  });

  it("accepts a street address of exactly the maximum length and rejects one character more", () => {
    const atLimit = "a".repeat(FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH);

    expect(firstFailure(validBody({ street_address: atLimit }))).toBeUndefined();
    expect(firstFailure(validBody({ street_address: `${atLimit}a` }))).toEqual(
      streetAddressFailure,
    );
  });

  it("reports the name before the street address", () => {
    expect(firstFailure({ name: "", street_address: "" })?.field).toBe("name");
  });
});
