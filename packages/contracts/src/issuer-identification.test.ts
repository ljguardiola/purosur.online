import { describe, expect, it } from "vitest";
import {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
} from "./issuer-identification.js";

describe("ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH", () => {
  it("allows legal names of up to 200 characters", () => {
    expect(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH).toBe(200);
  });
});

describe("ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH", () => {
  it("allows Ingresos Brutos registrations of up to 100 characters", () => {
    expect(ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH).toBe(100);
  });
});
