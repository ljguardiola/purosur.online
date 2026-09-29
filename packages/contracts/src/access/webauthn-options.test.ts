import { describe, expect, it } from "vitest";
import { creationOptionsSchema, requestOptionsSchema } from "./webauthn-options.js";

const creationOptions = {
  challenge: "Y2hhbGxlbmdl",
  rp: { name: "Puro Sur", id: "purosur.online" },
  user: { id: "dXNlci0x", name: "ada@example.com", displayName: "Ada" },
  pubKeyCredParams: [
    { alg: -8, type: "public-key" },
    { alg: -7, type: "public-key" },
  ],
  timeout: 60000,
  attestation: "none",
  excludeCredentials: [{ id: "Y3JlZC0x", type: "public-key", transports: ["internal", "hybrid"] }],
  authenticatorSelection: {
    residentKey: "required",
    requireResidentKey: true,
    userVerification: "required",
  },
  extensions: { credProps: true },
  hints: [],
};
const requestOptions = {
  challenge: "Y2hhbGxlbmdl",
  rpId: "purosur.online",
  allowCredentials: [{ id: "Y3JlZC0x", type: "public-key", transports: ["usb"] }],
  timeout: 60000,
  userVerification: "required",
};

function without<T extends object>(value: T, field: string): object {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

describe("creationOptionsSchema", () => {
  it("accepts the options the cloud sends", () => {
    expect(creationOptionsSchema.safeParse(creationOptions).data).toEqual(creationOptions);
  });

  it("accepts the smallest options the browser can act on", () => {
    const minimal = {
      challenge: creationOptions.challenge,
      rp: { name: "Puro Sur" },
      user: creationOptions.user,
      pubKeyCredParams: [],
    };

    expect(creationOptionsSchema.safeParse(minimal).data).toEqual(minimal);
  });

  it("drops a key left undefined, as the wire form of JSON would", () => {
    const parsed = creationOptionsSchema.safeParse({ ...creationOptions, timeout: undefined });

    expect(parsed.data).toEqual(without(creationOptions, "timeout"));
    expect(parsed.data).not.toHaveProperty("timeout");
  });

  it("keeps an extension the schema does not name", () => {
    const extensions = { credProps: true, prf: { eval: { first: "c2FsdA" } } };

    expect(creationOptionsSchema.safeParse({ ...creationOptions, extensions }).data).toEqual({
      ...creationOptions,
      extensions,
    });
  });

  it("strips keys it does not define", () => {
    expect(creationOptionsSchema.safeParse({ ...creationOptions, extra: 1 }).data).toEqual(
      creationOptions,
    );
  });

  it.each(["challenge", "rp", "user", "pubKeyCredParams"])("requires %s", (field) => {
    expect(creationOptionsSchema.safeParse(without(creationOptions, field)).success).toBe(false);
  });

  it.each([undefined, null, "options", 1, []])("refuses %j as options", (body) => {
    expect(creationOptionsSchema.safeParse(body).success).toBe(false);
  });

  it.each([
    ["challenge", 1],
    ["rp", { id: "purosur.online" }],
    ["rp", { name: 1 }],
    ["rp", { name: "Puro Sur", id: 1 }],
    ["user", { ...creationOptions.user, id: 1 }],
    ["user", { ...creationOptions.user, name: 1 }],
    ["user", { ...creationOptions.user, displayName: 1 }],
    ["user", without(creationOptions.user, "id")],
    ["user", without(creationOptions.user, "name")],
    ["user", without(creationOptions.user, "displayName")],
    ["pubKeyCredParams", {}],
    ["pubKeyCredParams", [{ alg: "-7", type: "public-key" }]],
    ["pubKeyCredParams", [{ alg: -7, type: "other" }]],
    ["pubKeyCredParams", [{ type: "public-key" }]],
    ["pubKeyCredParams", [{ alg: -7 }]],
    ["timeout", "60000"],
    ["attestation", "all"],
    ["excludeCredentials", {}],
    ["excludeCredentials", [{ type: "public-key" }]],
    ["excludeCredentials", [{ id: "Y3JlZC0x" }]],
    ["excludeCredentials", [{ id: 1, type: "public-key" }]],
    ["excludeCredentials", [{ id: "Y3JlZC0x", type: 1 }]],
    ["excludeCredentials", [{ id: "Y3JlZC0x", type: "public-key", transports: "usb" }]],
    ["excludeCredentials", [{ id: "Y3JlZC0x", type: "public-key", transports: [1] }]],
    ["authenticatorSelection", "required"],
    ["authenticatorSelection", { authenticatorAttachment: "roaming" }],
    ["authenticatorSelection", { requireResidentKey: "yes" }],
    ["authenticatorSelection", { residentKey: "always" }],
    ["authenticatorSelection", { userVerification: "always" }],
    ["hints", "hybrid"],
    ["hints", ["usb"]],
    ["attestationFormats", ["other"]],
    ["attestationFormats", "none"],
    ["extensions", "credProps"],
    ["extensions", { appid: 1 }],
    ["extensions", { credProps: "yes" }],
    ["extensions", { hmacCreateSecret: "yes" }],
    ["extensions", { minPinLength: "yes" }],
  ])("refuses %s as %j", (field, value) => {
    expect(creationOptionsSchema.safeParse({ ...creationOptions, [field]: value }).success).toBe(
      false,
    );
  });

  it.each(["cross-platform", "platform"])("accepts %s as the authenticator attachment", (value) => {
    const options = {
      ...creationOptions,
      authenticatorSelection: { authenticatorAttachment: value },
    };

    expect(creationOptionsSchema.safeParse(options).data).toEqual(options);
  });

  it.each(["discouraged", "preferred", "required"])("accepts %s as a requirement", (value) => {
    const options = {
      ...creationOptions,
      authenticatorSelection: { residentKey: value, userVerification: value },
    };

    expect(creationOptionsSchema.safeParse(options).data).toEqual(options);
  });

  it.each(["direct", "enterprise", "indirect", "none"])("accepts %s as attestation", (value) => {
    const options = { ...creationOptions, attestation: value };

    expect(creationOptionsSchema.safeParse(options).data).toEqual(options);
  });

  it.each(["fido-u2f", "packed", "android-safetynet", "android-key", "tpm", "apple", "none"])(
    "accepts %s as an attestation format",
    (value) => {
      const options = { ...creationOptions, attestationFormats: [value] };

      expect(creationOptionsSchema.safeParse(options).data).toEqual(options);
    },
  );

  it.each(["hybrid", "security-key", "client-device"])("accepts %s as a hint", (value) => {
    const options = { ...creationOptions, hints: [value] };

    expect(creationOptionsSchema.safeParse(options).data).toEqual(options);
  });

  it("accepts every extension flag", () => {
    const options = {
      ...creationOptions,
      extensions: {
        appid: "https://purosur.online",
        credProps: true,
        hmacCreateSecret: true,
        minPinLength: true,
      },
    };

    expect(creationOptionsSchema.safeParse(options).data).toEqual(options);
  });
});

describe("requestOptionsSchema", () => {
  it("accepts the options the cloud sends", () => {
    expect(requestOptionsSchema.safeParse(requestOptions).data).toEqual(requestOptions);
  });

  it("accepts the smallest options the browser can act on", () => {
    const minimal = { challenge: requestOptions.challenge };

    expect(requestOptionsSchema.safeParse(minimal).data).toEqual(minimal);
  });

  it("drops a key left undefined, as the wire form of JSON would", () => {
    const parsed = requestOptionsSchema.safeParse({ ...requestOptions, extensions: undefined });

    expect(parsed.data).toEqual(requestOptions);
    expect(parsed.data).not.toHaveProperty("extensions");
  });

  it("keeps an extension the schema does not name", () => {
    const extensions = { appid: "https://purosur.online", prf: { eval: { first: "c2FsdA" } } };

    expect(requestOptionsSchema.safeParse({ ...requestOptions, extensions }).data).toEqual({
      ...requestOptions,
      extensions,
    });
  });

  it("strips keys it does not define", () => {
    expect(requestOptionsSchema.safeParse({ ...requestOptions, extra: 1 }).data).toEqual(
      requestOptions,
    );
  });

  it("requires challenge", () => {
    expect(requestOptionsSchema.safeParse(without(requestOptions, "challenge")).success).toBe(
      false,
    );
  });

  it.each([undefined, null, "options", 1, []])("refuses %j as options", (body) => {
    expect(requestOptionsSchema.safeParse(body).success).toBe(false);
  });

  it.each([
    ["challenge", 1],
    ["rpId", 1],
    ["timeout", "60000"],
    ["userVerification", "always"],
    ["allowCredentials", {}],
    ["allowCredentials", [{ type: "public-key" }]],
    ["allowCredentials", [{ id: "Y3JlZC0x" }]],
    ["allowCredentials", [{ id: 1, type: "public-key" }]],
    ["allowCredentials", [{ id: "Y3JlZC0x", type: 1 }]],
    ["allowCredentials", [{ id: "Y3JlZC0x", type: "public-key", transports: "usb" }]],
    ["hints", "hybrid"],
    ["hints", ["usb"]],
    ["extensions", "appid"],
    ["extensions", { appid: 1 }],
  ])("refuses %s as %j", (field, value) => {
    expect(requestOptionsSchema.safeParse({ ...requestOptions, [field]: value }).success).toBe(
      false,
    );
  });

  it.each(["discouraged", "preferred", "required"])("accepts %s as a requirement", (value) => {
    const options = { ...requestOptions, userVerification: value };

    expect(requestOptionsSchema.safeParse(options).data).toEqual(options);
  });

  it.each(["hybrid", "security-key", "client-device"])("accepts %s as a hint", (value) => {
    const options = { ...requestOptions, hints: [value] };

    expect(requestOptionsSchema.safeParse(options).data).toEqual(options);
  });
});
