import { describe, expect, it } from "vitest";
import {
  qrPointOfSaleAssignmentBodySchema,
  qrPointOfSaleAssignmentSchema,
} from "./qr-point-of-sale-assignment.js";

const REGISTER_ID = "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10";
const EXTERNAL_POS_ID = "CAJA1_STORE_POS";

function firstFailure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = qrPointOfSaleAssignmentBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("qrPointOfSaleAssignmentBodySchema", () => {
  it("reads the QR point of sale and the version loaded", () => {
    const body = { external_pos_id: EXTERNAL_POS_ID, version: 0 };

    expect(qrPointOfSaleAssignmentBodySchema.parse(body)).toEqual(body);
  });

  it("reads a null QR point of sale as clearing the assignment", () => {
    const body = { external_pos_id: null, version: 3 };

    expect(qrPointOfSaleAssignmentBodySchema.parse(body)).toEqual(body);
  });

  it("drops the whitespace around the QR point of sale", () => {
    expect(
      qrPointOfSaleAssignmentBodySchema.parse({
        external_pos_id: ` ${EXTERNAL_POS_ID} `,
        version: 0,
      }),
    ).toEqual({ external_pos_id: EXTERNAL_POS_ID, version: 0 });
  });

  it.each([undefined, "", "   ", "CAJA 1", 7])(
    "rejects the QR point of sale %j",
    (external_pos_id) => {
      expect(firstFailure({ external_pos_id, version: 0 })).toEqual({
        field: "external_pos_id",
        message: "external_pos_id must be a QR point of sale id without spaces",
      });
    },
  );

  it.each([undefined, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure({ external_pos_id: EXTERNAL_POS_ID, version })).toEqual({
      field: "version",
      message: "version must be the non-negative integer it was loaded with",
    });
  });

  it("reports the QR point of sale, then the version", () => {
    const fields = qrPointOfSaleAssignmentBodySchema
      .safeParse({})
      .error?.issues.map((issue) => issue.path[0]);

    expect(fields).toEqual(["external_pos_id", "version"]);
  });
});

describe("qrPointOfSaleAssignmentSchema", () => {
  const assigned = { register_id: REGISTER_ID, external_pos_id: EXTERNAL_POS_ID, version: 1 };

  it("reads the QR point of sale a register was assigned", () => {
    expect(qrPointOfSaleAssignmentSchema.parse(assigned)).toEqual(assigned);
  });

  it("reads a register left with no QR point of sale", () => {
    const cleared = { ...assigned, external_pos_id: null, version: 2 };

    expect(qrPointOfSaleAssignmentSchema.parse(cleared)).toEqual(cleared);
  });

  it.each(["register_id", "external_pos_id", "version"])("refuses one without its %s", (field) => {
    expect(
      qrPointOfSaleAssignmentSchema.safeParse({ ...assigned, [field]: undefined }).success,
    ).toBe(false);
  });

  it("refuses a QR point of sale id holding spaces", () => {
    expect(
      qrPointOfSaleAssignmentSchema.safeParse({ ...assigned, external_pos_id: "CAJA 1" }).success,
    ).toBe(false);
  });
});
