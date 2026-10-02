import {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
} from "@purosur/domain";
import {
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { issuerIdentificationEditBodySchema } from "./issuer-identification-edit.js";

const TODAY = new Date("2026-09-25T12:00:00.000Z");
const schema = issuerIdentificationEditBodySchema(TODAY);

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    legal_name: FICTIONAL_LEGAL_NAME,
    gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
    activity_start_date: "2020-01-15",
    version: 1,
    ...overrides,
  };
}

function firstFailingField(body: unknown): unknown {
  const result = schema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.path[0];
}

function firstFailure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = schema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

function textFailure(field: string, maxLength: number) {
  return {
    field,
    message: `${field} must be a non-empty string of at most ${maxLength} characters`,
  };
}

const legalNameFailure = textFailure("legal_name", ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH);
const grossIncomeRegistrationFailure = textFailure(
  "gross_income_registration",
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
);
const activityStartDateFailure = {
  field: "activity_start_date",
  message: "activity_start_date must be a valid ISO calendar date (YYYY-MM-DD), not in the future",
};

describe("issuerIdentificationEditBodySchema", () => {
  it("accepts a fully valid body", () => {
    expect(schema.safeParse(validBody())).toMatchObject({
      success: true,
      data: {
        legal_name: FICTIONAL_LEGAL_NAME,
        gross_income_registration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activity_start_date: "2020-01-15",
        version: 1,
      },
    });
  });

  it("trims surrounding whitespace from the text fields", () => {
    const result = schema.safeParse(
      validBody({
        legal_name: `  ${FICTIONAL_LEGAL_NAME}  `,
        gross_income_registration: "  CM 901  ",
      }),
    );

    expect(result).toMatchObject({
      success: true,
      data: { legal_name: FICTIONAL_LEGAL_NAME, gross_income_registration: "CM 901" },
    });
  });

  it("rejects a missing legal_name", () => {
    const body = validBody();
    delete body["legal_name"];

    expect(firstFailure(body)).toEqual(legalNameFailure);
  });

  it("rejects a legal_name that is not a string", () => {
    expect(firstFailure(validBody({ legal_name: 42 }))).toEqual(legalNameFailure);
  });

  it("rejects an empty legal_name (blank after trimming)", () => {
    expect(firstFailure(validBody({ legal_name: "   " }))).toEqual(legalNameFailure);
  });

  it("accepts a legal_name of exactly the maximum length and rejects one character more", () => {
    const atLimit = "a".repeat(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH);

    expect(schema.safeParse(validBody({ legal_name: atLimit })).success).toBe(true);
    expect(firstFailure(validBody({ legal_name: `${atLimit}a` }))).toEqual(legalNameFailure);
  });

  it("rejects a missing gross_income_registration", () => {
    const body = validBody();
    delete body["gross_income_registration"];

    expect(firstFailure(body)).toEqual(grossIncomeRegistrationFailure);
  });

  it("rejects a gross_income_registration that is not a string", () => {
    expect(firstFailure(validBody({ gross_income_registration: 42 }))).toEqual(
      grossIncomeRegistrationFailure,
    );
  });

  it("rejects an empty gross_income_registration (blank after trimming)", () => {
    expect(firstFailure(validBody({ gross_income_registration: "   " }))).toEqual(
      grossIncomeRegistrationFailure,
    );
  });

  it("accepts a gross_income_registration of exactly the maximum length and rejects one character more", () => {
    const atLimit = "a".repeat(ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH);

    expect(schema.safeParse(validBody({ gross_income_registration: atLimit })).success).toBe(true);
    expect(firstFailure(validBody({ gross_income_registration: `${atLimit}a` }))).toEqual(
      grossIncomeRegistrationFailure,
    );
  });

  it("rejects an activity_start_date that is not a string", () => {
    expect(firstFailure(validBody({ activity_start_date: 20200115 }))).toEqual(
      activityStartDateFailure,
    );
  });

  it("rejects a missing activity_start_date", () => {
    const body = validBody();
    delete body["activity_start_date"];

    expect(firstFailure(body)).toEqual(activityStartDateFailure);
  });

  it("rejects an activity_start_date that is not zero-padded ISO YYYY-MM-DD", () => {
    expect(firstFailure(validBody({ activity_start_date: "2020-1-15" }))).toEqual(
      activityStartDateFailure,
    );
  });

  it("rejects a calendar date that does not exist, such as February 30th", () => {
    expect(firstFailure(validBody({ activity_start_date: "2020-02-30" }))).toEqual(
      activityStartDateFailure,
    );
  });

  it("accepts an activity_start_date of exactly today and rejects the next day", () => {
    expect(schema.safeParse(validBody({ activity_start_date: "2026-09-25" })).success).toBe(true);
    expect(firstFailure(validBody({ activity_start_date: "2026-09-26" }))).toEqual(
      activityStartDateFailure,
    );
  });

  it("takes today from Argentina's calendar at 23:30 there, when UTC is already on the next day", () => {
    const lateSchema = issuerIdentificationEditBodySchema(new Date("2026-09-25T23:30:00-03:00"));

    expect(lateSchema.safeParse(validBody({ activity_start_date: "2026-09-25" })).success).toBe(
      true,
    );
    expect(lateSchema.safeParse(validBody({ activity_start_date: "2026-09-26" })).success).toBe(
      false,
    );
  });

  it.each([
    { case: "a missing version", version: undefined },
    { case: "a non-integer version", version: 1.5 },
    { case: "a version below 1", version: 0 },
    { case: "a version that isn't a number", version: "1" },
  ])("rejects $case", ({ version }) => {
    expect(firstFailingField(validBody({ version }))).toBe("version");
  });

  it("reports the first failing field in body order", () => {
    const body = validBody({ version: 0, activity_start_date: "nope", legal_name: "" });

    expect(firstFailingField(body)).toBe("legal_name");
    expect(firstFailingField({ ...body, legal_name: FICTIONAL_LEGAL_NAME })).toBe(
      "activity_start_date",
    );
  });

  it("drops authorized_cuit and tax_status when a client sends them", () => {
    const result = schema.safeParse(
      validBody({ authorized_cuit: "20-99999999-9", tax_status: "Responsable Inscripto" }),
    );

    expect(result.success && Object.keys(result.data).sort()).toEqual([
      "activity_start_date",
      "gross_income_registration",
      "legal_name",
      "version",
    ]);
  });
});

describe("issuerIdentificationEditBodySchema, declared limits", () => {
  it("declares each text's maximum length", () => {
    expect(schema.shape.legal_name.meta()).toEqual({
      maxLength: ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
    });
    expect(schema.shape.gross_income_registration.meta()).toEqual({
      maxLength: ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
    });
  });
});
