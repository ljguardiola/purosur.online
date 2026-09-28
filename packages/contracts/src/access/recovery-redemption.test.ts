import { describe, expect, it } from "vitest";
import { recoveryRedemptionBodySchema } from "./recovery-redemption.js";

const REGISTRATION = { id: "credential-id", response: { clientDataJSON: "abc" } };

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    recovery_token: "raw-token",
    passkey_registration: REGISTRATION,
    passkey_name: "Notebook",
    ...overrides,
  };
}

function firstIssue(body: unknown): { field: unknown; message: string } | undefined {
  const result = recoveryRedemptionBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("recoveryRedemptionBodySchema", () => {
  it("accepts a token, a registration and a name, trimming the name", () => {
    const result = recoveryRedemptionBodySchema.safeParse(
      validBody({ passkey_name: " Notebook " }),
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        recovery_token: "raw-token",
        passkey_registration: REGISTRATION,
        passkey_name: "Notebook",
      },
    });
  });

  it("rejects a missing recovery token", () => {
    expect(firstIssue(validBody({ recovery_token: undefined }))?.field).toBe("recovery_token");
  });

  it.each([undefined, null, ""])("rejects the registration %j", (passkey_registration) => {
    expect(firstIssue(validBody({ passkey_registration }))).toEqual({
      field: "passkey_registration",
      message: "passkey_registration is required",
    });
  });

  it.each([undefined, "", "   ", 42, "a".repeat(41)])("rejects the name %j", (passkey_name) => {
    expect(firstIssue(validBody({ passkey_name }))).toEqual({
      field: "passkey_name",
      message: "passkey_name is required and must be 1-40 characters once trimmed",
    });
  });

  it("reports the fields in the order token, registration, name", () => {
    expect(firstIssue({})?.field).toBe("recovery_token");
    expect(firstIssue({ recovery_token: "raw-token" })?.field).toBe("passkey_registration");
    expect(
      firstIssue({ recovery_token: "raw-token", passkey_registration: REGISTRATION })?.field,
    ).toBe("passkey_name");
  });
});
