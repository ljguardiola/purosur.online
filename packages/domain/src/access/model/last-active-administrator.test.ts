import { describe, expect, it } from "vitest";
import { isLastActiveAdministrator } from "./last-active-administrator.js";

describe("isLastActiveAdministrator", () => {
  it("is true for a holder of the Administrator role when they are the only active one", () => {
    expect(isLastActiveAdministrator({ holdsAdministratorRole: true }, 1)).toBe(true);
  });

  it("is false for a holder of the Administrator role when another active administrator exists", () => {
    expect(isLastActiveAdministrator({ holdsAdministratorRole: true }, 2)).toBe(false);
  });

  it("is false for someone who does not hold the Administrator role", () => {
    expect(isLastActiveAdministrator({ holdsAdministratorRole: false }, 1)).toBe(false);
  });

  it("is false when the branch has no active administrator", () => {
    expect(isLastActiveAdministrator({ holdsAdministratorRole: true }, 0)).toBe(false);
  });
});
