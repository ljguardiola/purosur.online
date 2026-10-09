import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type RegisterSummaryBody,
  registerListSchema,
  registerSummarySchema,
} from "./register-summary.js";

const pendingCode = {
  seconds_since_issued: 0,
  seconds_until_expiry: 900,
};
const withoutCode = {
  id: "register-1",
  name: "Caja 1",
  pending_code: null,
  point_of_sale_number: null,
  installation: null,
};
const enrolledInstallation = {
  state: "enrolled",
  hostname: "CAJA-MOSTRADOR",
  windows_version: "Windows 11 Pro 10.0.26100",
  enrolled_at: "2026-08-01T15:00:00.000Z",
};
const revokedInstallation = {
  ...enrolledInstallation,
  state: "revoked",
  revoked_at: "2026-08-03T18:30:00.000Z",
};
const withCode = {
  id: "register-2",
  name: "Caja 2",
  pending_code: pendingCode,
  point_of_sale_number: 3,
  installation: null,
};

describe("registerSummarySchema", () => {
  it("accepts a register with no pending code and one with a pending code", () => {
    expect(registerSummarySchema.safeParse(withoutCode).data).toEqual(withoutCode);
    expect(registerSummarySchema.safeParse(withCode).data).toEqual(withCode);
  });

  it("accepts an enrolled installation and a revoked one", () => {
    const enrolled = { ...withoutCode, installation: enrolledInstallation };
    const revoked = { ...withoutCode, installation: revokedInstallation };

    expect(registerSummarySchema.safeParse(enrolled).data).toEqual(enrolled);
    expect(registerSummarySchema.safeParse(revoked).data).toEqual(revoked);
  });

  it("strips keys it does not define in the installation", () => {
    const parsed = registerSummarySchema.safeParse({
      ...withoutCode,
      installation: { ...enrolledInstallation, token_hash: "secret" },
    });

    expect(parsed.data?.installation).toEqual(enrolledInstallation);
  });

  it("accepts a code that expires within its last second", () => {
    const lastSecond = {
      ...withCode,
      pending_code: { seconds_since_issued: 899, seconds_until_expiry: 1 },
    };

    expect(registerSummarySchema.safeParse(lastSecond).data).toEqual(lastSecond);
  });

  it("strips keys it does not define, in the register and in its pending code", () => {
    const parsed = registerSummarySchema.safeParse({
      ...withCode,
      location_id: "location-1",
      pending_code: { ...pendingCode, expires_at: "2026-09-25T12:15:00.000Z" },
    });

    expect(parsed.data).toEqual(withCode);
  });

  it.each(["id", "name", "pending_code", "point_of_sale_number", "installation"])(
    "requires %s",
    (field) => {
      const { [field as keyof typeof withCode]: _omitted, ...rest } = withCode;

      expect(registerSummarySchema.safeParse(rest).success).toBe(false);
    },
  );

  it.each(["seconds_since_issued", "seconds_until_expiry"])(
    "requires the pending code's %s",
    (field) => {
      const { [field as keyof typeof pendingCode]: _omitted, ...rest } = pendingCode;

      expect(registerSummarySchema.safeParse({ ...withCode, pending_code: rest }).success).toBe(
        false,
      );
    },
  );

  it.each([
    ["id", 1],
    ["id", null],
    ["name", 1],
    ["name", null],
    ["pending_code", undefined],
    ["installation", undefined],
    ["installation", "enrolled"],
    ["installation", { ...enrolledInstallation, state: "pending" }],
    ["installation", { ...enrolledInstallation, state: undefined }],
    ["installation", { ...enrolledInstallation, hostname: 1 }],
    ["installation", { ...enrolledInstallation, windows_version: null }],
    ["installation", { ...enrolledInstallation, enrolled_at: null }],
    ["installation", { ...enrolledInstallation, enrolled_at: undefined }],
    ["installation", { ...revokedInstallation, revoked_at: null }],
    ["installation", { ...revokedInstallation, revoked_at: undefined }],
    ["point_of_sale_number", undefined],
    ["point_of_sale_number", 0],
    ["point_of_sale_number", 1.5],
    ["point_of_sale_number", "3"],
    ["pending_code", "2026-09-25T12:15:00.000Z"],
    ["pending_code", { ...pendingCode, seconds_since_issued: "0" }],
    ["pending_code", { ...pendingCode, seconds_since_issued: null }],
    ["pending_code", { ...pendingCode, seconds_since_issued: -1 }],
    ["pending_code", { ...pendingCode, seconds_since_issued: 1.5 }],
    ["pending_code", { ...pendingCode, seconds_until_expiry: "900" }],
    ["pending_code", { ...pendingCode, seconds_until_expiry: null }],
    ["pending_code", { ...pendingCode, seconds_until_expiry: 0 }],
    ["pending_code", { ...pendingCode, seconds_until_expiry: 1.5 }],
  ])("refuses %s as %j", (field, value) => {
    expect(registerSummarySchema.safeParse({ ...withCode, [field]: value }).success).toBe(false);
  });

  it("declares the zone the installation's instants are shown in", () => {
    const installation = registerSummarySchema.shape.installation.unwrap();

    for (const variant of installation.options) {
      expect(variant.shape.enrolled_at.meta()).toEqual({ timeZone: ARGENTINA_TIME_ZONE });
    }
    expect(installation.options[1].shape.revoked_at.meta()).toEqual({
      timeZone: ARGENTINA_TIME_ZONE,
    });
  });

  it("types its output as the wire shape", () => {
    expectTypeOf<RegisterSummaryBody["name"]>().toEqualTypeOf<string>();
    expectTypeOf<RegisterSummaryBody["pending_code"]>().toEqualTypeOf<{
      seconds_since_issued: number;
      seconds_until_expiry: number;
    } | null>();
    expectTypeOf<RegisterSummaryBody["installation"]>().toEqualTypeOf<
      | { state: "enrolled"; hostname: string; windows_version: string; enrolled_at: string }
      | {
          state: "revoked";
          hostname: string;
          windows_version: string;
          enrolled_at: string;
          revoked_at: string;
        }
      | null
    >();
  });
});

describe("registerListSchema", () => {
  it("accepts a list of registers, empty or not", () => {
    expect(registerListSchema.safeParse([]).data).toEqual([]);
    expect(registerListSchema.safeParse([withoutCode, withCode]).data).toEqual([
      withoutCode,
      withCode,
    ]);
  });

  it.each([undefined, null, {}, "registers", withoutCode])("refuses %j as a list", (body) => {
    expect(registerListSchema.safeParse(body).success).toBe(false);
  });

  it("refuses a list holding a malformed register", () => {
    expect(registerListSchema.safeParse([withoutCode, { ...withCode, name: 2 }]).success).toBe(
      false,
    );
  });
});
