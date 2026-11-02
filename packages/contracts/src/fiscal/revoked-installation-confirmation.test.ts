import { describe, expect, it } from "vitest";
import { revokedInstallationConfirmationBodySchema } from "./revoked-installation-confirmation.js";

describe("revokedInstallationConfirmationBodySchema", () => {
  const body = {
    point_of_sale_number: 4,
    fortnight_start: "2026-09-01",
    installation_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b11",
  };

  it("reads the point of sale, the fortnight and the installation", () => {
    expect(revokedInstallationConfirmationBodySchema.parse(body)).toEqual(body);
  });

  it("reads the installation as a record id, lowercased like the stored one", () => {
    expect(
      revokedInstallationConfirmationBodySchema.parse({
        ...body,
        installation_id: "3F0D1A52-0F7E-4A53-9F4C-2A7D2F1C9B11",
      }).installation_id,
    ).toBe("3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b11");
  });

  it.each(["point_of_sale_number", "fortnight_start", "installation_id"])(
    "refuses a body without its %s",
    (field) => {
      expect(
        revokedInstallationConfirmationBodySchema.safeParse({ ...body, [field]: undefined })
          .success,
      ).toBe(false);
    },
  );

  it.each([
    ["an installation that is not a record id", { installation_id: "installation-1" }],
    ["a fortnight start that is not a day", { fortnight_start: "September" }],
    ["a point of sale of zero", { point_of_sale_number: 0 }],
  ])("refuses %s", (_case, change) => {
    expect(
      revokedInstallationConfirmationBodySchema.safeParse({ ...body, ...change }).success,
    ).toBe(false);
  });
});
