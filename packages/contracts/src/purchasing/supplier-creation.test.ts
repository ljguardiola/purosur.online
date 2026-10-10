import {
  SUPPLIER_CONTACT_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_NOTE_MAX_LENGTH,
} from "@purosur/domain";
import {
  ANOTHER_FICTIONAL_CUIT,
  CUIT_NUMBER_NO_CHECK_DIGIT_VALIDATES,
  FICTIONAL_CUIT,
} from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { supplierCreationBodySchema } from "./supplier-creation.js";

const NAME_MESSAGE = `name must be a non-empty string of at most ${SUPPLIER_NAME_MAX_LENGTH} characters`;
const CUIT_MESSAGE = "cuit must be a valid CUIT in the form NN-NNNNNNNN-N";

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = supplierCreationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("supplierCreationBodySchema", () => {
  it("accepts every field and trims the text", () => {
    expect(
      supplierCreationBodySchema.safeParse({
        name: "  Distribuidora Norte  ",
        cuit: ` ${FICTIONAL_CUIT} `,
        contact: "  ventas@example.com ",
        note: " Entrega los martes ",
      }).data,
    ).toEqual({
      name: "Distribuidora Norte",
      cuit: FICTIONAL_CUIT,
      contact: "ventas@example.com",
      note: "Entrega los martes",
    });
  });

  it("reads a missing, null, empty or blank cuit, contact and note as null", () => {
    expect(supplierCreationBodySchema.safeParse({ name: "A" }).data).toEqual({
      name: "A",
      cuit: null,
      contact: null,
      note: null,
    });
    expect(
      supplierCreationBodySchema.safeParse({ name: "A", cuit: null, contact: "", note: "   " })
        .data,
    ).toEqual({ name: "A", cuit: null, contact: null, note: null });
    expect(supplierCreationBodySchema.safeParse({ name: "A", cuit: "  " }).data?.cuit).toBeNull();
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j", (name) => {
    expect(firstFailure({ name })).toEqual({ field: "name", message: NAME_MESSAGE });
  });

  it("accepts a name of exactly the domain's maximum length and rejects a longer one", () => {
    expect(
      supplierCreationBodySchema.safeParse({ name: "a".repeat(SUPPLIER_NAME_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(firstFailure({ name: "a".repeat(SUPPLIER_NAME_MAX_LENGTH + 1) })).toEqual({
      field: "name",
      message: NAME_MESSAGE,
    });
  });

  it.each([
    ["contact", SUPPLIER_CONTACT_MAX_LENGTH],
    ["note", SUPPLIER_NOTE_MAX_LENGTH],
  ])(
    "accepts a %s of exactly the domain's maximum length and rejects a longer one",
    (field, max) => {
      expect(
        supplierCreationBodySchema.safeParse({ name: "A", [field]: "a".repeat(max) }).success,
      ).toBe(true);
      expect(firstFailure({ name: "A", [field]: "a".repeat(max + 1) })).toEqual({
        field,
        message: `${field} must be a string of at most ${max} characters`,
      });
    },
  );

  it.each([
    ["contact", `contact must be a string of at most ${SUPPLIER_CONTACT_MAX_LENGTH} characters`],
    ["note", `note must be a string of at most ${SUPPLIER_NOTE_MAX_LENGTH} characters`],
    ["cuit", CUIT_MESSAGE],
  ])("rejects a %s that is not text", (field, message) => {
    expect(firstFailure({ name: "A", [field]: 42 })).toEqual({ field, message });
  });

  it("accepts another valid cuit", () => {
    expect(
      supplierCreationBodySchema.safeParse({ name: "A", cuit: ANOTHER_FICTIONAL_CUIT }).data?.cuit,
    ).toBe(ANOTHER_FICTIONAL_CUIT);
  });

  it.each([CUIT_NUMBER_NO_CHECK_DIGIT_VALIDATES, "not a cuit", FICTIONAL_CUIT.replaceAll("-", "")])(
    "rejects the cuit %j",
    (cuit) => {
      expect(firstFailure({ name: "A", cuit })).toEqual({ field: "cuit", message: CUIT_MESSAGE });
    },
  );

  it("strips keys it does not know", () => {
    expect(
      supplierCreationBodySchema.safeParse({ name: "A", active: false, version: 3 }).data,
    ).toEqual({ name: "A", cuit: null, contact: null, note: null });
  });

  it.each([null, undefined, "Norte", 1, []])("rejects the body %j as not an object", (body) => {
    expect(supplierCreationBodySchema.safeParse(body).success).toBe(false);
  });

  it("declares the maximum length of each text", () => {
    expect(supplierCreationBodySchema.shape.name.meta()).toEqual({
      maxLength: SUPPLIER_NAME_MAX_LENGTH,
    });
    expect(supplierCreationBodySchema.shape.contact.meta()).toEqual({
      maxLength: SUPPLIER_CONTACT_MAX_LENGTH,
    });
    expect(supplierCreationBodySchema.shape.note.meta()).toEqual({
      maxLength: SUPPLIER_NOTE_MAX_LENGTH,
    });
  });
});
