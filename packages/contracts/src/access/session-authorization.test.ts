import { describe, expect, it } from "vitest";
import { sessionAuthorizationBodySchema } from "./session-authorization.js";

const ASSERTION = { id: "credential-id", response: { clientDataJSON: "abc" } };

describe("sessionAuthorizationBodySchema", () => {
  it("accepts an authorization carrying a credential id, handing it back with everything else it carries", () => {
    const result = sessionAuthorizationBodySchema.safeParse({ authorization: ASSERTION });

    expect(result).toMatchObject({ success: true, data: { authorization: ASSERTION } });
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
  ])("rejects the authorization %j", (authorization) => {
    expect(sessionAuthorizationBodySchema.safeParse({ authorization }).success).toBe(false);
  });

  it.each([undefined, null, "authorization", 42, []])("rejects the body %j", (body) => {
    expect(sessionAuthorizationBodySchema.safeParse(body).success).toBe(false);
  });
});
