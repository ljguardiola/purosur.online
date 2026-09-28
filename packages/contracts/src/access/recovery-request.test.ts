import { describe, expect, it } from "vitest";
import { recoveryRequestBodySchema } from "./recovery-request.js";

describe("recoveryRequestBodySchema", () => {
  it("accepts an email, trimmed and lowercased", () => {
    const result = recoveryRequestBodySchema.safeParse({ email: "  Ada@Example.com  " });

    expect(result).toMatchObject({ success: true, data: { email: "ada@example.com" } });
  });

  it.each([undefined, "", "not-an-email", 42, null])("rejects the email %j", (email) => {
    const result = recoveryRequestBodySchema.safeParse({ email });

    expect(result.success ? undefined : result.error.issues[0]?.path[0]).toBe("email");
  });
});
