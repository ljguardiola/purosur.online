import { describe, expect, it } from "vitest";
import { currentOfflineAuthorizationCodeSchema } from "./current-offline-authorization-code.js";

const code = {
  code: "36123456789012",
  fortnight_start: "2026-10-01",
  fortnight_end: "2026-10-15",
  report_deadline: "2026-10-20",
};

describe("currentOfflineAuthorizationCodeSchema", () => {
  it("reads the stored code with its fortnight and report deadline", () => {
    const body = { offline_authorization_code: code };

    expect(currentOfflineAuthorizationCodeSchema.parse(body)).toEqual(body);
  });

  it("reads that no code is stored for the current fortnight", () => {
    expect(
      currentOfflineAuthorizationCodeSchema.parse({ offline_authorization_code: null }),
    ).toEqual({ offline_authorization_code: null });
  });

  it("refuses a body that does not say whether a code is stored", () => {
    expect(currentOfflineAuthorizationCodeSchema.safeParse({}).success).toBe(false);
  });

  it.each(["fortnight_start", "fortnight_end", "report_deadline"] as const)(
    "refuses %s that is not a calendar day",
    (field) => {
      expect(
        currentOfflineAuthorizationCodeSchema.safeParse({
          offline_authorization_code: { ...code, [field]: "2026-13-40" },
        }).success,
      ).toBe(false);
    },
  );

  it.each(["code", "fortnight_start", "fortnight_end", "report_deadline"] as const)(
    "refuses a stored code missing its %s",
    (field) => {
      expect(
        currentOfflineAuthorizationCodeSchema.safeParse({
          offline_authorization_code: { ...code, [field]: undefined },
        }).success,
      ).toBe(false);
    },
  );
});
