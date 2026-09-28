import { REGISTER_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { registerCreationBodySchema } from "./register-creation.js";

describe("registerCreationBodySchema", () => {
  it("accepts a name and trims it", () => {
    const result = registerCreationBodySchema.safeParse({ name: "  Caja 1  " });

    expect(result).toMatchObject({ success: true, data: { name: "Caja 1" } });
  });

  it("rejects a missing name", () => {
    const result = registerCreationBodySchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.issues[0]?.path).toEqual(["name"]);
  });

  it("rejects a name that is empty or blank after trimming", () => {
    expect(registerCreationBodySchema.safeParse({ name: "" }).success).toBe(false);
    expect(registerCreationBodySchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name that is not a string", () => {
    const result = registerCreationBodySchema.safeParse({ name: 42 });

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.issues[0]?.path).toEqual(["name"]);
  });

  it("accepts a name of exactly the domain's maximum length", () => {
    const name = "a".repeat(REGISTER_NAME_MAX_LENGTH);

    expect(registerCreationBodySchema.safeParse({ name }).success).toBe(true);
  });

  it("rejects a name longer than the domain's maximum length", () => {
    const name = "a".repeat(REGISTER_NAME_MAX_LENGTH + 1);
    const result = registerCreationBodySchema.safeParse({ name });

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.issues[0]?.path).toEqual(["name"]);
  });

  it("counts each emoji as one character toward the domain's maximum length, after trimming", () => {
    const name = `  ${"🏪".repeat(REGISTER_NAME_MAX_LENGTH)}  `;

    expect(registerCreationBodySchema.safeParse({ name }).success).toBe(true);
  });
});
