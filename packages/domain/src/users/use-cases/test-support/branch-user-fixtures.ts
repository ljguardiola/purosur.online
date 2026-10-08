import type { FakeBranchUser } from "./fake-branch-users.js";

export const BRANCH = "branch-1";

export function user(overrides: Partial<FakeBranchUser> & { id: string }): FakeBranchUser {
  return {
    locationId: BRANCH,
    firstName: "Ana",
    email: `${overrides.id}@example.test`,
    version: 1,
    active: true,
    roleId: "role-cashier",
    roleName: "Cajero",
    roleIsAdministrator: false,
    passkeyCount: 0,
    ...overrides,
  };
}

export function administrator(overrides: Partial<FakeBranchUser> & { id: string }): FakeBranchUser {
  return user({ roleId: "role-admin", roleName: null, roleIsAdministrator: true, ...overrides });
}
