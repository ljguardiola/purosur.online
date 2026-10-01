import { describe, expect, it } from "vitest";
import { isReactivationOffered } from "./email-holder-disclosure.js";

const holder = { active: false, locationId: "branch-1" };
const requester = { locationId: "branch-1", mayReactivateUsers: true };

describe("isReactivationOffered", () => {
  it("offers reactivating a deactivated user of the requester's branch to someone who may", () => {
    expect(isReactivationOffered(holder, requester)).toBe(true);
  });

  it("offers nothing when the holder is active", () => {
    expect(isReactivationOffered({ ...holder, active: true }, requester)).toBe(false);
  });

  it("never reveals a user of another branch", () => {
    expect(isReactivationOffered({ ...holder, locationId: "branch-2" }, requester)).toBe(false);
  });

  it("offers nothing to someone who may not reactivate users", () => {
    expect(isReactivationOffered(holder, { ...requester, mayReactivateUsers: false })).toBe(false);
  });
});
