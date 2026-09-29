import { INSTALLATION_REPORT_MAX_LENGTH } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { deviceEnrollmentBodySchema, deviceEnrollmentSchema } from "./device-enrollment.js";

const VALID_BODY = {
  code: "P4NX 7KWE 2QRT 6MZD",
  hostname: "CAJA-MOSTRADOR",
  windows_version: "Windows 11 Pro 10.0.26100",
};

function firstIssue(body: unknown): { path: unknown; message: unknown } | undefined {
  const result = deviceEnrollmentBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

const CODE_ISSUE = { path: ["code"], message: "code must be 16 base32 characters" };

describe("deviceEnrollmentBodySchema", () => {
  it("reads the code without its spaces and in uppercase", () => {
    const result = deviceEnrollmentBodySchema.parse({ ...VALID_BODY, code: "p4nx 7kwe 2qrt 6mzd" });

    expect(result).toEqual({ ...VALID_BODY, code: "P4NX7KWE2QRT6MZD" });
  });

  it.each([
    ["missing", undefined],
    ["not a string", 42],
    ["too short", "P4NX 7KWE 2QRT"],
    ["made of characters outside base32", "P4NX 7KWE 2QRT 6MZ1"],
  ])("rejects a code that is %s", (_case, code) => {
    expect(firstIssue({ ...VALID_BODY, code })).toEqual(CODE_ISSUE);
  });

  it.each(["hostname", "windows_version"] as const)("trims the reported %s", (field) => {
    const result = deviceEnrollmentBodySchema.parse({ ...VALID_BODY, [field]: "  valor  " });

    expect(result[field]).toBe("valor");
  });

  it.each(["hostname", "windows_version"] as const)(
    "rejects a %s that is missing, blank or not a string",
    (field) => {
      const issue = { path: [field], message: `${field} must not be empty` };

      expect(firstIssue({ ...VALID_BODY, [field]: undefined })).toEqual(issue);
      expect(firstIssue({ ...VALID_BODY, [field]: "   " })).toEqual(issue);
      expect(firstIssue({ ...VALID_BODY, [field]: 7 })).toEqual(issue);
    },
  );

  it.each(["hostname", "windows_version"] as const)(
    "accepts a %s of the domain's maximum length and rejects a longer one",
    (field) => {
      const longest = "a".repeat(INSTALLATION_REPORT_MAX_LENGTH);

      expect(
        deviceEnrollmentBodySchema.safeParse({ ...VALID_BODY, [field]: longest }).success,
      ).toBe(true);
      expect(firstIssue({ ...VALID_BODY, [field]: `${longest}a` })).toEqual({
        path: [field],
        message: `${field} must be at most ${INSTALLATION_REPORT_MAX_LENGTH} characters`,
      });
    },
  );
});

describe("deviceEnrollmentSchema", () => {
  it("carries the new installation's device id and device token", () => {
    const body = { device_id: "a4b1", device_token: "prefix.secret" };

    expect(deviceEnrollmentSchema.parse(body)).toEqual(body);
  });

  it.each(["device_id", "device_token"])("rejects a body without %s", (field) => {
    const body: Record<string, string> = { device_id: "a4b1", device_token: "prefix.secret" };
    delete body[field];

    expect(deviceEnrollmentSchema.safeParse(body).success).toBe(false);
  });
});
