import { describe, expect, it } from "vitest";
import { sessionAuthenticationBodySchema } from "./session-authentication.js";

const ASSERTION = { id: "credential-id", response: { clientDataJSON: "abc" } };

describe("sessionAuthenticationBodySchema", () => {
  it("accepts an assertion carrying a credential id, handing it back with everything else it carries", () => {
    const result = sessionAuthenticationBodySchema.safeParse({ assertion: ASSERTION });

    expect(result).toMatchObject({ success: true, data: { assertion: ASSERTION } });
  });

  it.each([
    undefined,
    null,
    "",
    "credential-id",
    42,
    true,
    [],
    {},
    { id: 42 },
    { id: null },
    { response: {} },
  ])("rejects the assertion %j", (assertion) => {
    expect(sessionAuthenticationBodySchema.safeParse({ assertion }).success).toBe(false);
  });

  it.each([undefined, null, "assertion", 42, []])("rejects the body %j", (body) => {
    expect(sessionAuthenticationBodySchema.safeParse(body).success).toBe(false);
  });
});
