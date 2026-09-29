import { describe, expect, it } from "vitest";
import { passkeyRegistrationChallengeSchema } from "./passkey-registration-challenge.js";

const options = {
  challenge: "Y2hhbGxlbmdl",
  rp: { name: "Puro Sur", id: "purosur.online" },
  user: { id: "dXNlci0x", name: "ada@example.com", displayName: "Ada" },
  pubKeyCredParams: [{ alg: -7, type: "public-key" }],
};
const body = { passkey_registration_options: options };

describe("passkeyRegistrationChallengeSchema", () => {
  it("accepts the body the cloud sends", () => {
    expect(passkeyRegistrationChallengeSchema.safeParse(body).data).toEqual(body);
  });

  it("strips keys it does not define", () => {
    expect(passkeyRegistrationChallengeSchema.safeParse({ ...body, extra: 1 }).data).toEqual(body);
  });

  it("requires passkey_registration_options", () => {
    expect(passkeyRegistrationChallengeSchema.safeParse({}).success).toBe(false);
  });

  it("refuses passkey_registration_options that are not options", () => {
    expect(
      passkeyRegistrationChallengeSchema.safeParse({
        ...body,
        passkey_registration_options: { challenge: 1 },
      }).success,
    ).toBe(false);
  });

  it.each([undefined, null, "body", 1, []])("refuses %j as a body", (value) => {
    expect(passkeyRegistrationChallengeSchema.safeParse(value).success).toBe(false);
  });
});
