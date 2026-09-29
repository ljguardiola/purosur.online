import { describe, expect, it } from "vitest";
import { sessionAuthenticationOptionsSchema } from "./session-authentication-options.js";

const options = {
  challenge: "Y2hhbGxlbmdl",
  rpId: "purosur.online",
};
const body = { passkey_authentication_options: options };

describe("sessionAuthenticationOptionsSchema", () => {
  it("accepts the body the cloud sends", () => {
    expect(sessionAuthenticationOptionsSchema.safeParse(body).data).toEqual(body);
  });

  it("strips keys it does not define", () => {
    expect(sessionAuthenticationOptionsSchema.safeParse({ ...body, extra: 1 }).data).toEqual(body);
  });

  it("requires passkey_authentication_options", () => {
    expect(sessionAuthenticationOptionsSchema.safeParse({}).success).toBe(false);
  });

  it("refuses passkey_authentication_options that are not options", () => {
    expect(
      sessionAuthenticationOptionsSchema.safeParse({
        ...body,
        passkey_authentication_options: { challenge: 1 },
      }).success,
    ).toBe(false);
  });

  it.each([undefined, null, "body", 1, []])("refuses %j as a body", (value) => {
    expect(sessionAuthenticationOptionsSchema.safeParse(value).success).toBe(false);
  });
});
