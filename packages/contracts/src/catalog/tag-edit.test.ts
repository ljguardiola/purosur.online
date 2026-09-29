import { TAG_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { tagEditBodySchema } from "./tag-edit.js";

function firstFailure(body: unknown): { field: unknown; message: unknown } | undefined {
  const result = tagEditBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("tagEditBodySchema", () => {
  it("reads the name and the version loaded", () => {
    expect(tagEditBodySchema.safeParse({ name: " Sin TACC ", version: 2 }).data).toEqual({
      name: "Sin TACC",
      version: 2,
    });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the name %j as empty", (name) => {
    expect(firstFailure({ name, version: 1 })).toEqual({
      field: "name",
      message: "name must not be empty",
    });
  });

  it("rejects a name longer than the domain's maximum length", () => {
    expect(firstFailure({ name: "a".repeat(TAG_NAME_MAX_LENGTH + 1), version: 1 })).toEqual({
      field: "name",
      message: `name must be at most ${TAG_NAME_MAX_LENGTH} characters`,
    });
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailure({ name: "A", version })).toEqual({
      field: "version",
      message: "version must be the positive integer it was loaded with",
    });
  });

  it("reports the name before the version", () => {
    expect(firstFailure({ name: "", version: 0 })?.field).toBe("name");
  });

  it("strips keys it does not know, so an edit can never change whether the tag is active", () => {
    expect(tagEditBodySchema.safeParse({ name: "A", version: 1, active: false }).data).toEqual({
      name: "A",
      version: 1,
    });
  });
});
