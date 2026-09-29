import { describe, expect, it } from "vitest";
import { sessionAuthorizationOptionsSchema } from "./session-authorization-options.js";

const options = {
  challenge: "Y2hhbGxlbmdl",
  rpId: "purosur.online",
};
const body = { authorization_options: options };

describe("sessionAuthorizationOptionsSchema", () => {
  it("accepts the body the cloud sends", () => {
    expect(sessionAuthorizationOptionsSchema.safeParse(body).data).toEqual(body);
  });

  it("strips keys it does not define", () => {
    expect(sessionAuthorizationOptionsSchema.safeParse({ ...body, extra: 1 }).data).toEqual(body);
  });

  it("requires authorization_options", () => {
    expect(sessionAuthorizationOptionsSchema.safeParse({}).success).toBe(false);
  });

  it("refuses authorization_options that are not options", () => {
    expect(
      sessionAuthorizationOptionsSchema.safeParse({
        ...body,
        authorization_options: { challenge: 1 },
      }).success,
    ).toBe(false);
  });

  it.each([undefined, null, "body", 1, []])("refuses %j as a body", (value) => {
    expect(sessionAuthorizationOptionsSchema.safeParse(value).success).toBe(false);
  });
});
