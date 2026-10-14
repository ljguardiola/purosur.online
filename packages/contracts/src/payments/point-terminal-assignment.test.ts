import { describe, expect, it } from "vitest";
import {
  pointTerminalAssignmentBodySchema,
  pointTerminalAssignmentSchema,
} from "./point-terminal-assignment.js";

const REGISTER_ID = "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10";
const TERMINAL = "PAX_A910__SMARTPOS1234567890";

function firstFailure(body: unknown): { field: unknown; message: string | undefined } | undefined {
  const result = pointTerminalAssignmentBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("pointTerminalAssignmentBodySchema", () => {
  it("reads the terminal and the version loaded", () => {
    const body = { terminal_id: TERMINAL, version: 0 };

    expect(pointTerminalAssignmentBodySchema.parse(body)).toEqual(body);
  });

  it("reads a null terminal as clearing the assignment", () => {
    const body = { terminal_id: null, version: 3 };

    expect(pointTerminalAssignmentBodySchema.parse(body)).toEqual(body);
  });

  it("drops the whitespace around the terminal", () => {
    expect(
      pointTerminalAssignmentBodySchema.parse({ terminal_id: ` ${TERMINAL} `, version: 0 }),
    ).toEqual({ terminal_id: TERMINAL, version: 0 });
  });

  it.each([undefined, "", "   ", "PAX A910", 7])("rejects the terminal %j", (terminal_id) => {
    expect(firstFailure({ terminal_id, version: 0 })).toEqual({
      field: "terminal_id",
      message: "terminal_id must be a Point terminal id without spaces",
    });
  });

  it.each([undefined, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure({ terminal_id: TERMINAL, version })).toEqual({
      field: "version",
      message: "version must be the non-negative integer it was loaded with",
    });
  });

  it("reports the terminal, then the version", () => {
    const fields = pointTerminalAssignmentBodySchema
      .safeParse({})
      .error?.issues.map((issue) => issue.path[0]);

    expect(fields).toEqual(["terminal_id", "version"]);
  });
});

describe("pointTerminalAssignmentSchema", () => {
  const assigned = { register_id: REGISTER_ID, terminal_id: TERMINAL, version: 1 };

  it("reads the terminal a register was assigned", () => {
    expect(pointTerminalAssignmentSchema.parse(assigned)).toEqual(assigned);
  });

  it("reads a register left with no terminal", () => {
    const cleared = { ...assigned, terminal_id: null, version: 2 };

    expect(pointTerminalAssignmentSchema.parse(cleared)).toEqual(cleared);
  });

  it.each(["register_id", "terminal_id", "version"])("refuses one without its %s", (field) => {
    expect(
      pointTerminalAssignmentSchema.safeParse({ ...assigned, [field]: undefined }).success,
    ).toBe(false);
  });

  it("refuses a terminal id holding spaces", () => {
    expect(
      pointTerminalAssignmentSchema.safeParse({ ...assigned, terminal_id: "PAX A910" }).success,
    ).toBe(false);
  });
});
