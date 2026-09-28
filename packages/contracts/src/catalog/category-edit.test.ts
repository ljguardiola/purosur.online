import { CATEGORY_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { categoryEditBodySchema } from "./category-edit.js";

const ID = "11111111-1111-1111-1111-111111111111";

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = categoryEditBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("categoryEditBodySchema", () => {
  it("reads the name, the parent and the version loaded", () => {
    expect(
      categoryEditBodySchema.safeParse({ name: " Semillas ", parentId: ID, version: 2 }).data,
    ).toEqual({ name: "Semillas", parentId: ID, version: 2 });
  });

  it("reads a null parent as top level", () => {
    expect(
      categoryEditBodySchema.safeParse({ name: "A", parentId: null, version: 1 }).data,
    ).toEqual({
      name: "A",
      parentId: null,
      version: 1,
    });
  });

  it("reads an id sent in uppercase in its canonical lowercase form", () => {
    expect(
      categoryEditBodySchema.safeParse({
        name: "A",
        parentId: "D131EC62-1111-4AAA-8BBB-ABCDEF012345",
        version: 1,
      }).data?.parentId,
    ).toBe("d131ec62-1111-4aaa-8bbb-abcdef012345");
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j as empty", (name) => {
    expect(firstFailure({ name, parentId: null, version: 1 })).toEqual({
      field: "name",
      message: "name must not be empty",
    });
  });

  it("rejects a name longer than the domain's maximum length", () => {
    expect(
      firstFailure({ name: "a".repeat(CATEGORY_NAME_MAX_LENGTH + 1), parentId: null, version: 1 }),
    ).toEqual({
      field: "name",
      message: `name must be at most ${CATEGORY_NAME_MAX_LENGTH} characters`,
    });
  });

  it("requires the parentId key so a client that omits it cannot un-nest a category", () => {
    expect(firstFailure({ name: "A", version: 1 })).toEqual({
      field: "parentId",
      message: "parentId must be sent, null for top level",
    });
  });

  it.each([42, "", true])("rejects the parentId %j", (parentId) => {
    expect(firstFailure({ name: "A", parentId, version: 1 })).toEqual({
      field: "parentId",
      message: "parentId must be an existing category's id, or null for top level",
    });
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure({ name: "A", parentId: null, version })).toEqual({
      field: "version",
      message: "version must be the positive integer it was loaded with",
    });
  });

  it("reports the name, then the parent id, then the version", () => {
    expect(firstFailure({ name: "", version: 0 })?.field).toBe("name");
    expect(firstFailure({ name: "A", version: 0 })?.field).toBe("parentId");
    expect(firstFailure({ name: "A", parentId: 42, version: 0 })?.field).toBe("parentId");
    expect(firstFailure({ name: "A", parentId: null, version: 0 })?.field).toBe("version");
  });

  it("strips keys it does not know", () => {
    expect(
      categoryEditBodySchema.safeParse({ name: "A", parentId: null, version: 1, active: false })
        .data,
    ).not.toHaveProperty("active");
  });
});
