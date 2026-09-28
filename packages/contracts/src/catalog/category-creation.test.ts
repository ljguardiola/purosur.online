import { CATEGORY_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { categoryCreationBodySchema } from "./category-creation.js";

const ID = "11111111-1111-1111-1111-111111111111";

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = categoryCreationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("categoryCreationBodySchema, name", () => {
  it("accepts a name and trims it", () => {
    expect(categoryCreationBodySchema.safeParse({ name: "  Semillas  " }).data).toEqual({
      name: "Semillas",
      parentId: null,
    });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j as empty", (name) => {
    expect(firstFailure({ name })).toEqual({ field: "name", message: "name must not be empty" });
  });

  it("accepts a name of exactly the domain's maximum length and rejects a longer one", () => {
    expect(
      categoryCreationBodySchema.safeParse({ name: "a".repeat(CATEGORY_NAME_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(firstFailure({ name: "a".repeat(CATEGORY_NAME_MAX_LENGTH + 1) })).toEqual({
      field: "name",
      message: `name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters`,
    });
  });
});

describe("categoryCreationBodySchema, parentId", () => {
  it.each([undefined, null])("reads %j as top level", (parentId) => {
    expect(categoryCreationBodySchema.safeParse({ name: "A", parentId }).data).toEqual({
      name: "A",
      parentId: null,
    });
  });

  it("keeps a parent id", () => {
    expect(categoryCreationBodySchema.safeParse({ name: "A", parentId: ID }).data?.parentId).toBe(
      ID,
    );
  });

  it("reads an id sent in uppercase in its canonical lowercase form", () => {
    expect(
      categoryCreationBodySchema.safeParse({
        name: "A",
        parentId: "D131EC62-1111-4AAA-8BBB-ABCDEF012345",
      }).data?.parentId,
    ).toBe("d131ec62-1111-4aaa-8bbb-abcdef012345");
  });

  it.each([42, "", true, {}])("rejects the parentId %j", (parentId) => {
    expect(firstFailure({ name: "A", parentId })).toEqual({
      field: "parentId",
      message: "parentId must be an existing category's id, or null for top level",
    });
  });

  it("reports the name before the parent id", () => {
    expect(firstFailure({ name: "", parentId: 42 })?.field).toBe("name");
  });

  it("strips keys it does not know", () => {
    expect(categoryCreationBodySchema.safeParse({ name: "A", version: 2 }).data).toEqual({
      name: "A",
      parentId: null,
    });
  });
});
