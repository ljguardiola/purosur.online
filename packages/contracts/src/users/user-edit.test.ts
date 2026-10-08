import { describe, expect, it } from "vitest";
import { userEditBodySchema } from "./user-edit.js";

const ROLE_ID = "3f2b8c1e-9a4d-4e7b-8c55-0d1e2f3a4b5c";

function firstFailingField(body: unknown): unknown {
  const result = userEditBodySchema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.path[0];
}

describe("userEditBodySchema", () => {
  it("accepts an email, a role id and the version the user was loaded with, normalizing the email", () => {
    const result = userEditBodySchema.safeParse({
      email: " Ada@Example.com ",
      role_id: ROLE_ID,
      version: 4,
    });

    expect(result).toMatchObject({
      success: true,
      data: { email: "ada@example.com", role_id: ROLE_ID, version: 4 },
    });
  });

  it("does not take a first name", () => {
    const result = userEditBodySchema.safeParse({
      first_name: "Ada",
      email: "ada@example.com",
      role_id: ROLE_ID,
      version: 1,
    });

    expect(result.success && "first_name" in result.data).toBe(false);
  });

  it("rejects an email that isn't local@domain", () => {
    expect(firstFailingField({ email: "nope", role_id: ROLE_ID, version: 1 })).toBe("email");
  });

  it("rejects a role id that isn't a UUID", () => {
    expect(firstFailingField({ email: "ada@example.com", role_id: "nope", version: 1 })).toBe(
      "role_id",
    );
  });

  it.each([undefined, 0, -1, 1.5, "1", null])("rejects the version %j", (version) => {
    expect(firstFailingField({ email: "ada@example.com", role_id: ROLE_ID, version })).toBe(
      "version",
    );
  });

  it("reports the fields in the order email, role id, version", () => {
    expect(firstFailingField({})).toBe("email");
    expect(firstFailingField({ email: "ada@example.com" })).toBe("role_id");
    expect(firstFailingField({ email: "ada@example.com", role_id: ROLE_ID })).toBe("version");
  });
});
