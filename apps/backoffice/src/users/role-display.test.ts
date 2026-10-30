import { describe, expect, it } from "vitest";
import { withCreatedRole } from "./role-display";

const administrator = { id: "role-admin", isAdministrator: true, name: null };
const cashier = { id: "role-cashier", isAdministrator: false, name: "Cajero" };
const depot = { id: "role-depot", isAdministrator: false, name: "Depósito" };

describe("withCreatedRole", () => {
  it("adds the role just created after the listed ones", () => {
    expect(withCreatedRole([administrator, cashier], depot)).toEqual([
      administrator,
      cashier,
      depot,
    ]);
  });

  it("keeps the list as it is once it already lists the role just created", () => {
    expect(withCreatedRole([administrator, depot], depot)).toEqual([administrator, depot]);
  });

  it("keeps the list as it is when no role was created", () => {
    expect(withCreatedRole([administrator, cashier], null)).toEqual([administrator, cashier]);
  });
});
