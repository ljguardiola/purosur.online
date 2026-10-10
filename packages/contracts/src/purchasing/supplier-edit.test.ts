import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { supplierEditBodySchema } from "./supplier-edit.js";

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = supplierEditBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("supplierEditBodySchema", () => {
  it("reads the fields and the version loaded", () => {
    expect(
      supplierEditBodySchema.safeParse({
        name: " Norte ",
        cuit: FICTIONAL_CUIT,
        contact: "",
        note: "Nota",
        version: 2,
      }).data,
    ).toEqual({ name: "Norte", cuit: FICTIONAL_CUIT, contact: null, note: "Nota", version: 2 });
  });

  it("applies the creation rules to the fields", () => {
    expect(firstFailure({ name: "", version: 1 })?.field).toBe("name");
    expect(firstFailure({ name: "A", cuit: "x", version: 1 })?.field).toBe("cuit");
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure({ name: "A", version })).toEqual({
      field: "version",
      message: "version must be the positive integer it was loaded with",
    });
  });

  it("strips keys it does not know, so an edit can never change whether the supplier is active", () => {
    expect(supplierEditBodySchema.safeParse({ name: "A", version: 1, active: false }).data).toEqual(
      {
        name: "A",
        cuit: null,
        contact: null,
        note: null,
        version: 1,
      },
    );
  });
});
