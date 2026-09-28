import { REGISTER_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { registerCreationBodySchema } from "./register-creation.js";

function firstIssue(body: unknown): { path: unknown; message: unknown } | undefined {
  const result = registerCreationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

const EMPTY_NAME_ISSUE = { path: ["name"], message: "name must not be empty" };

describe("registerCreationBodySchema", () => {
  it("accepts a name and trims it", () => {
    const result = registerCreationBodySchema.safeParse({ name: "  Caja 1  " });

    expect(result).toMatchObject({ success: true, data: { name: "Caja 1" } });
  });

  it("rejects a missing name as empty", () => {
    expect(firstIssue({})).toEqual(EMPTY_NAME_ISSUE);
  });

  it("rejects a name that is empty or blank after trimming", () => {
    expect(firstIssue({ name: "" })).toEqual(EMPTY_NAME_ISSUE);
    expect(firstIssue({ name: "   " })).toEqual(EMPTY_NAME_ISSUE);
  });

  it("rejects a name that is not a string as empty", () => {
    expect(firstIssue({ name: 42 })).toEqual(EMPTY_NAME_ISSUE);
  });

  it("accepts a name of exactly the domain's maximum length", () => {
    const name = "a".repeat(REGISTER_NAME_MAX_LENGTH);

    expect(registerCreationBodySchema.safeParse({ name }).success).toBe(true);
  });

  it("rejects a name longer than the domain's maximum length", () => {
    const name = "a".repeat(REGISTER_NAME_MAX_LENGTH + 1);

    expect(firstIssue({ name })).toEqual({
      path: ["name"],
      message: `name must be at most ${REGISTER_NAME_MAX_LENGTH} characters`,
    });
  });

  it("counts each emoji as one character toward the domain's maximum length, after trimming", () => {
    const name = `  ${"🏪".repeat(REGISTER_NAME_MAX_LENGTH)}  `;

    expect(registerCreationBodySchema.safeParse({ name }).success).toBe(true);
  });
});
