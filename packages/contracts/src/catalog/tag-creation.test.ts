import { TAG_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { tagCreationBodySchema } from "./tag-creation.js";

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = tagCreationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("tagCreationBodySchema", () => {
  it("accepts a name and trims it", () => {
    expect(tagCreationBodySchema.safeParse({ name: "  Sin TACC  " }).data).toEqual({
      name: "Sin TACC",
    });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j as empty", (name) => {
    expect(firstFailure({ name })).toEqual({ field: "name", message: "name must not be empty" });
  });

  it("accepts a name of exactly the domain's maximum length and rejects a longer one", () => {
    expect(tagCreationBodySchema.safeParse({ name: "a".repeat(TAG_NAME_MAX_LENGTH) }).success).toBe(
      true,
    );
    expect(firstFailure({ name: "a".repeat(TAG_NAME_MAX_LENGTH + 1) })).toEqual({
      field: "name",
      message: `name must be at most ${TAG_NAME_MAX_LENGTH} characters`,
    });
  });

  it("strips keys it does not know", () => {
    expect(tagCreationBodySchema.safeParse({ name: "A", active: false }).data).toEqual({
      name: "A",
    });
  });

  it.each([null, undefined, "Sin TACC", 1, []])("rejects the body %j as not an object", (body) => {
    expect(tagCreationBodySchema.safeParse(body).success).toBe(false);
  });
});
