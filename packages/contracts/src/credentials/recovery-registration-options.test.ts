import { describe, expect, it } from "vitest";
import { recoveryRegistrationOptionsSchema } from "./recovery-registration-options.js";

const options = {
  challenge: "Y2hhbGxlbmdl",
  rp: { name: "Puro Sur", id: "purosur.online" },
  user: { id: "dXNlci0x", name: "ada@example.com", displayName: "Ada" },
  pubKeyCredParams: [{ alg: -7, type: "public-key" }],
};
const body = { passkey_registration_options: options, display_name: "Ada" };

describe("recoveryRegistrationOptionsSchema", () => {
  it("accepts the body the cloud sends", () => {
    expect(recoveryRegistrationOptionsSchema.safeParse(body).data).toEqual(body);
  });

  it("strips keys it does not define", () => {
    expect(recoveryRegistrationOptionsSchema.safeParse({ ...body, extra: 1 }).data).toEqual(body);
  });

  it("requires passkey_registration_options", () => {
    expect(recoveryRegistrationOptionsSchema.safeParse({}).success).toBe(false);
  });

  it("refuses passkey_registration_options that are not options", () => {
    expect(
      recoveryRegistrationOptionsSchema.safeParse({
        ...body,
        passkey_registration_options: { challenge: 1 },
      }).success,
    ).toBe(false);
  });

  it.each([undefined, null, "body", 1, []])("refuses %j as a body", (value) => {
    expect(recoveryRegistrationOptionsSchema.safeParse(value).success).toBe(false);
  });
});

describe("recoveryRegistrationOptionsSchema display name", () => {
  it("requires display_name", () => {
    const { display_name: _omitted, ...rest } = { ...body };

    expect(recoveryRegistrationOptionsSchema.safeParse(rest).success).toBe(false);
  });

  it("refuses a display_name that is not text", () => {
    expect(recoveryRegistrationOptionsSchema.safeParse({ ...body, display_name: 1 }).success).toBe(
      false,
    );
  });
});
