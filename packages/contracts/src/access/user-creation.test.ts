import { describe, expect, it } from "vitest";
import { userCreationBodySchema } from "./user-creation.js";

const ROLE_ID = "3f2b8c1e-9a4d-4e7b-8c55-0d1e2f3a4b5c";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { first_name: "Ada", email: "ada@example.com", role_id: ROLE_ID, ...overrides };
}

function firstFailingField(body: unknown): unknown {
  const result = userCreationBodySchema.safeParse(body);
  return result.success ? undefined : result.error.issues[0]?.path[0];
}

describe("userCreationBodySchema", () => {
  it("accepts a first name, an email and a role id, trimming the name and normalizing the email", () => {
    const result = userCreationBodySchema.safeParse(
      validBody({ first_name: "  Ada  ", email: "  Ada@Example.com  " }),
    );

    expect(result).toMatchObject({
      success: true,
      data: { first_name: "Ada", email: "ada@example.com", role_id: ROLE_ID },
    });
  });

  it.each([undefined, "", "   ", 42, null])("rejects the first name %j", (first_name) => {
    expect(firstFailingField(validBody({ first_name }))).toBe("first_name");
  });

  it.each([undefined, "", "not-an-email", "ada@", 42, null])("rejects the email %j", (email) => {
    expect(firstFailingField(validBody({ email }))).toBe("email");
  });

  it("rejects an email longer than an address can be", () => {
    const localPart = "a".repeat(255 - "@example.com".length);

    expect(firstFailingField(validBody({ email: `${localPart}@example.com` }))).toBe("email");
  });

  it.each([undefined, "", "not-a-uuid", 42, null, `${ROLE_ID}0`, ` ${ROLE_ID}`])(
    "rejects the role id %j",
    (role_id) => {
      expect(firstFailingField(validBody({ role_id }))).toBe("role_id");
    },
  );

  it("accepts a role id in upper case, and one whose version and variant digits are unusual", () => {
    expect(
      userCreationBodySchema.safeParse(validBody({ role_id: ROLE_ID.toUpperCase() })).success,
    ).toBe(true);
    expect(
      userCreationBodySchema.safeParse(
        validBody({ role_id: "00000000-0000-0000-0000-000000000000" }),
      ).success,
    ).toBe(true);
  });

  it("reports the fields in the order first name, email, role id", () => {
    expect(firstFailingField({})).toBe("first_name");
    expect(firstFailingField({ first_name: "Ada" })).toBe("email");
    expect(firstFailingField({ first_name: "Ada", email: "ada@example.com" })).toBe("role_id");
  });
});
