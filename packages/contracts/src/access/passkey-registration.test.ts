import { PASSKEY_NAME_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { passkeyRegistrationBodySchema } from "./passkey-registration.js";

const REGISTRATION = { id: "credential-id", response: { clientDataJSON: "abc" } };

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { passkey_registration: REGISTRATION, passkey_name: "Notebook", ...overrides };
}

function firstIssue(body: unknown): { field: unknown; message: string } | undefined {
  const result = passkeyRegistrationBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("passkeyRegistrationBodySchema", () => {
  it("accepts a registration and a name, handing the registration back untouched and the name trimmed", () => {
    const result = passkeyRegistrationBodySchema.safeParse(
      validBody({ passkey_name: "  Notebook del local  " }),
    );

    expect(result).toMatchObject({
      success: true,
      data: { passkey_registration: REGISTRATION, passkey_name: "Notebook del local" },
    });
  });

  it.each([undefined, null, "", 0, false])(
    "rejects the registration %j",
    (passkey_registration) => {
      expect(firstIssue(validBody({ passkey_registration }))).toEqual({
        field: "passkey_registration",
        message: "passkey_registration is required",
      });
    },
  );

  it.each(["a registration the library will refuse", 42, true, []])(
    "leaves verifying the registration %j to the library",
    (passkey_registration) => {
      expect(
        passkeyRegistrationBodySchema.safeParse(validBody({ passkey_registration })).success,
      ).toBe(true);
    },
  );

  it.each([undefined, "", "   ", 42, null])("rejects the name %j", (passkey_name) => {
    expect(firstIssue(validBody({ passkey_name }))).toEqual({
      field: "passkey_name",
      message: "passkey_name is required and must be 1-40 characters once trimmed",
    });
  });

  it("accepts a name of the maximum length and rejects one character more", () => {
    const longest = "a".repeat(PASSKEY_NAME_MAX_LENGTH);

    expect(
      passkeyRegistrationBodySchema.safeParse(validBody({ passkey_name: longest })).success,
    ).toBe(true);
    expect(firstIssue(validBody({ passkey_name: `${longest}a` }))?.field).toBe("passkey_name");
  });

  it("measures the name once trimmed", () => {
    const padded = ` ${"a".repeat(PASSKEY_NAME_MAX_LENGTH)} `;

    expect(
      passkeyRegistrationBodySchema.safeParse(validBody({ passkey_name: padded })).success,
    ).toBe(true);
  });

  it("reports the registration before the name", () => {
    expect(firstIssue({})?.field).toBe("passkey_registration");
    expect(firstIssue({ passkey_registration: REGISTRATION })?.field).toBe("passkey_name");
  });
});
