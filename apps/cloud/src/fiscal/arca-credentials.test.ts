import { describe, expect, it } from "vitest";
import {
  VALID_ARCA_CERTIFICATE,
  VALID_ARCA_CERTIFICATE_SINGLE_LINE,
} from "../test-support/arca-certificate-fixtures.js";
import { arcaCredentialsOf } from "./arca-credentials.js";

describe("arcaCredentialsOf", () => {
  const environment = { ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE, ARCA_PRIVATE_KEY: "KEY" };

  it("reads the certificate and the private key from the environment", () => {
    expect(arcaCredentialsOf(environment)).toEqual({
      kind: "ready",
      certificatePem: VALID_ARCA_CERTIFICATE,
      privateKeyPem: "KEY",
    });
  });

  it("turns the literal \\n of a collapsed variable into line breaks", () => {
    expect(
      arcaCredentialsOf({
        ARCA_CERTIFICATE: VALID_ARCA_CERTIFICATE_SINGLE_LINE,
        ARCA_PRIVATE_KEY: "C\\nD",
      }),
    ).toEqual({
      kind: "ready",
      certificatePem: VALID_ARCA_CERTIFICATE.trimEnd(),
      privateKeyPem: "C\nD",
    });
  });

  it.each(["ARCA_CERTIFICATE", "ARCA_PRIVATE_KEY"])("refuses without %s, naming it", (name) => {
    expect(arcaCredentialsOf({ ...environment, [name]: undefined })).toEqual({
      kind: "refused",
      reason: expect.stringContaining(name),
    });
  });

  it.each(["ARCA_CERTIFICATE", "ARCA_PRIVATE_KEY"])("refuses %s set to nothing", (name) => {
    expect(arcaCredentialsOf({ ...environment, [name]: "" })).toEqual({
      kind: "refused",
      reason: expect.stringContaining(name),
    });
  });
});
