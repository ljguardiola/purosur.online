import {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { issuerIdentificationEditBodySchema } from "./issuer-identification-edit.js";

const TODAY = new Date("2026-09-25T12:00:00.000Z");
const schema = issuerIdentificationEditBodySchema(TODAY);

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    legal_name: "Puro Sur SRL",
    gross_income_registration: "CM 901-123456-3",
    activity_start_date: "2020-01-15",
    version: 1,
    ...overrides,
  };
}

function firstFailingField(body: unknown): unknown {
  const result = schema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.path[0];
}

describe("issuerIdentificationEditBodySchema", () => {
  it("accepts a fully valid body", () => {
    expect(schema.safeParse(validBody())).toMatchObject({
      success: true,
      data: {
        legal_name: "Puro Sur SRL",
        gross_income_registration: "CM 901-123456-3",
        activity_start_date: "2020-01-15",
        version: 1,
      },
    });
  });

  it("trims surrounding whitespace from the text fields", () => {
    const result = schema.safeParse(
      validBody({ legal_name: "  Puro Sur SRL  ", gross_income_registration: "  CM 901  " }),
    );

    expect(result).toMatchObject({
      success: true,
      data: { legal_name: "Puro Sur SRL", gross_income_registration: "CM 901" },
    });
  });

  it("rejects a missing legal_name", () => {
    const body = validBody();
    delete body["legal_name"];

    expect(firstFailingField(body)).toBe("legal_name");
  });

  it("rejects a legal_name that is not a string", () => {
    expect(firstFailingField(validBody({ legal_name: 42 }))).toBe("legal_name");
  });

  it("rejects an empty legal_name (blank after trimming)", () => {
    expect(firstFailingField(validBody({ legal_name: "   " }))).toBe("legal_name");
  });

  it("accepts a legal_name of exactly the maximum length and rejects one character more", () => {
    const atLimit = "a".repeat(ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH);

    expect(schema.safeParse(validBody({ legal_name: atLimit })).success).toBe(true);
    expect(firstFailingField(validBody({ legal_name: `${atLimit}a` }))).toBe("legal_name");
  });

  it("rejects a missing gross_income_registration", () => {
    const body = validBody();
    delete body["gross_income_registration"];

    expect(firstFailingField(body)).toBe("gross_income_registration");
  });

  it("rejects an empty gross_income_registration", () => {
    expect(firstFailingField(validBody({ gross_income_registration: "" }))).toBe(
      "gross_income_registration",
    );
  });

  it("accepts a gross_income_registration of exactly the maximum length and rejects one character more", () => {
    const atLimit = "a".repeat(ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH);

    expect(schema.safeParse(validBody({ gross_income_registration: atLimit })).success).toBe(true);
    expect(firstFailingField(validBody({ gross_income_registration: `${atLimit}a` }))).toBe(
      "gross_income_registration",
    );
  });

  it("rejects an activity_start_date that is not a string", () => {
    expect(firstFailingField(validBody({ activity_start_date: 20200115 }))).toBe(
      "activity_start_date",
    );
  });

  it("rejects a missing activity_start_date", () => {
    const body = validBody();
    delete body["activity_start_date"];

    expect(firstFailingField(body)).toBe("activity_start_date");
  });

  it("rejects an activity_start_date that is not zero-padded ISO YYYY-MM-DD", () => {
    expect(firstFailingField(validBody({ activity_start_date: "2020-1-15" }))).toBe(
      "activity_start_date",
    );
  });

  it("rejects a calendar date that does not exist, such as February 30th", () => {
    expect(firstFailingField(validBody({ activity_start_date: "2020-02-30" }))).toBe(
      "activity_start_date",
    );
  });

  it("accepts an activity_start_date of exactly today and rejects the next day", () => {
    expect(schema.safeParse(validBody({ activity_start_date: "2026-09-25" })).success).toBe(true);
    expect(firstFailingField(validBody({ activity_start_date: "2026-09-26" }))).toBe(
      "activity_start_date",
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
    expect(firstFailingField({ ...body, legal_name: "Puro Sur SRL" })).toBe("activity_start_date");
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
