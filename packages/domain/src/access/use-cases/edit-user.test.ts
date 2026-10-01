import { describe, expect, it } from "vitest";
import { editUser } from "./edit-user.js";
import { administrator, BRANCH, user } from "./test-support/branch-user-fixtures.js";
import { FakeBranchUsers } from "./test-support/fake-branch-users.js";
import { FakeUserStore } from "./test-support/fake-user-store.js";
import type { UserStore } from "./user-store.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const clock = { now: () => new Date(NOW) };

interface Seed {
  target?: Parameters<typeof user>[0];
  others?: Parameters<FakeUserStore["seedUser"]>[0][];
}

function fixture({ target = { id: "u-1", version: 3 }, others = [] }: Seed = {}) {
  const store = new FakeUserStore();
  store.seedRole({
    id: "role-cashier",
    name: "Cajero",
    isAdministrator: false,
    permissionKeys: ["sell_and_charge"],
  });
  store.seedRole({
    id: "role-manager",
    name: "Gerente",
    isAdministrator: false,
    permissionKeys: ["sell_and_charge", "view_sales_history"],
  });
  store.seedRole({ id: "role-admin", name: null, isAdministrator: true, permissionKeys: [] });
  store.seedUser(target.roleIsAdministrator ? administrator(target) : user(target));
  for (const other of others) {
    store.seedUser(other);
  }
  const base = store.snapshot().users[0];
  const edit = (
    change: { email?: string; roleId?: string; version?: number; id?: string } = {},
    onStore: UserStore = store,
  ) =>
    editUser(
      { store: onStore, clock },
      {
        id: change.id ?? "u-1",
        locationId: BRANCH,
        email: change.email ?? base?.email ?? "",
        roleId: change.roleId ?? base?.roleId ?? "",
        version: change.version ?? base?.version ?? 0,
        actorId: "actor-1",
      },
    );
  return { store, edit };
}

describe("editUser", () => {
  it("refuses a role that does not exist and writes nothing", async () => {
    const { store, edit } = fixture();

    const outcome = await edit({ roleId: "role-missing" });

    expect(outcome).toEqual({ kind: "unknown_role" });
    expect(store.operationOrder).toEqual(["findRole"]);
  });

  it("changes the email, bumps the version and answers with the edited user", async () => {
    const { store, edit } = fixture();

    const outcome = await edit({ email: "new@example.test" });

    expect(outcome).toMatchObject({
      kind: "applied",
      user: { id: "u-1", email: "new@example.test", version: 4, roleId: "role-cashier" },
    });
    expect(store.snapshot().users[0]).toMatchObject({ email: "new@example.test", version: 4 });
  });

  it("voids the recovery links sent to the previous email", async () => {
    const { store, edit } = fixture({ target: { id: "u-1", email: "old@example.test" } });

    await edit({ email: "new@example.test" });

    expect(store.snapshot().voidedRecoveryTokens).toEqual([{ userId: "u-1", at: NOW }]);
  });

  it("records the email change and alerts about it", async () => {
    const { store, edit } = fixture({ target: { id: "u-1", email: "old@example.test" } });

    await edit({ email: "new@example.test" });

    const after = store.snapshot();
    expect(after.changes).toEqual([
      {
        userId: "u-1",
        actorId: "actor-1",
        change: {
          kind: "email_changed",
          previousEmail: "old@example.test",
          email: "new@example.test",
        },
      },
    ]);
    expect(after.alerts).toEqual([
      {
        kind: "email_changed",
        userId: "u-1",
        previousEmail: "old@example.test",
        newEmail: "new@example.test",
        actorId: "actor-1",
        openedAt: NOW,
      },
    ]);
  });

  it("changes the role, bumps the version and records the change", async () => {
    const { store, edit } = fixture();

    const outcome = await edit({ roleId: "role-manager" });

    expect(outcome).toMatchObject({
      kind: "applied",
      user: { roleId: "role-manager", roleName: "Gerente", version: 4 },
    });
    expect(store.snapshot().changes).toEqual([
      {
        userId: "u-1",
        actorId: "actor-1",
        change: { kind: "role_changed", previousRoleId: "role-cashier", roleId: "role-manager" },
      },
    ]);
    expect(store.snapshot().voidedRecoveryTokens).toEqual([]);
  });

  it("alerts when the new role grants more access than the previous one", async () => {
    const { store, edit } = fixture();

    await edit({ roleId: "role-manager" });

    expect(store.snapshot().alerts).toEqual([
      {
        kind: "role_assigned",
        userId: "u-1",
        previousRole: { name: "Cajero", isAdministrator: false },
        newRole: { name: "Gerente", isAdministrator: false },
        actorId: "actor-1",
        openedAt: NOW,
      },
    ]);
  });

  it("does not alert when the new role grants no more access", async () => {
    const { store, edit } = fixture({
      target: { id: "u-1", roleId: "role-manager", roleName: "Gerente", version: 3 },
    });

    await edit({ roleId: "role-cashier" });

    expect(store.snapshot().alerts).toEqual([]);
    expect(store.snapshot().changes).toHaveLength(1);
  });

  it("bumps the version once when the email and the role change together", async () => {
    const { store, edit } = fixture();

    await edit({ email: "new@example.test", roleId: "role-manager" });

    expect(store.snapshot().users[0]).toMatchObject({ version: 4 });
    expect(store.snapshot().changes.map(({ change }) => change.kind)).toEqual([
      "email_changed",
      "role_changed",
    ]);
  });

  it("writes nothing when neither the email nor the role changes", async () => {
    const { store, edit } = fixture();

    const outcome = await edit();

    expect(outcome).toMatchObject({ kind: "applied", user: { id: "u-1", version: 3 } });
    const after = store.snapshot();
    expect(after.users[0]).toMatchObject({ version: 3 });
    expect(after.changes).toEqual([]);
    expect(after.alerts).toEqual([]);
    expect(after.voidedRecoveryTokens).toEqual([]);
  });

  it("answers stale version when the user was changed since it was loaded", async () => {
    const { store, edit } = fixture();

    const outcome = await edit({ email: "new@example.test", version: 2 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot().users[0]).toMatchObject({ email: "u-1@example.test", version: 3 });
  });

  it("answers stale version when the user no longer exists", async () => {
    const { edit } = fixture();

    expect(await edit({ id: "u-missing" })).toEqual({ kind: "stale_version" });
  });

  it("answers stale version when the branch has no Administrator role", async () => {
    const store = new FakeUserStore();
    store.seedRole({
      id: "role-cashier",
      name: "Cajero",
      isAdministrator: false,
      permissionKeys: [],
    });
    store.seedUser(user({ id: "u-1" }));

    const outcome = await editUser(
      { store, clock },
      {
        id: "u-1",
        locationId: BRANCH,
        email: "u-1@example.test",
        roleId: "role-cashier",
        version: 1,
        actorId: "actor-1",
      },
    );

    expect(outcome).toEqual({ kind: "stale_version" });
  });

  it("refuses to move the only active administrator of the branch away from the role", async () => {
    const { store, edit } = fixture({ target: { id: "u-1", roleIsAdministrator: true } });

    const outcome = await edit({ roleId: "role-cashier" });

    expect(outcome).toEqual({ kind: "last_administrator" });
    expect(store.snapshot().users[0]).toMatchObject({ roleId: "role-admin", version: 1 });
    expect(store.snapshot().changes).toEqual([]);
  });

  it("lets the only active administrator change their email while keeping the role", async () => {
    const { edit } = fixture({ target: { id: "u-1", roleIsAdministrator: true } });

    const outcome = await edit({ email: "new@example.test" });

    expect(outcome).toMatchObject({
      kind: "applied",
      user: { email: "new@example.test", isLastActiveAdministrator: true },
    });
  });

  it("lets an administrator leave the role when another active one remains in the branch", async () => {
    const { edit } = fixture({
      target: { id: "u-1", roleIsAdministrator: true },
      others: [administrator({ id: "u-2" })],
    });

    const outcome = await edit({ roleId: "role-cashier" });

    expect(outcome).toMatchObject({ kind: "applied", user: { roleId: "role-cashier" } });
  });

  it("lets a user who is not an administrator change role while the branch has a single administrator", async () => {
    const { edit } = fixture({ others: [administrator({ id: "u-2" })] });

    const outcome = await edit({ roleId: "role-manager" });

    expect(outcome).toMatchObject({ kind: "applied", user: { roleId: "role-manager" } });
  });

  it("does not count a deactivated administrator or another branch's administrator", async () => {
    const { edit } = fixture({
      target: { id: "u-1", roleIsAdministrator: true },
      others: [
        administrator({ id: "u-2", active: false }),
        administrator({ id: "u-3", locationId: "branch-2" }),
      ],
    });

    expect(await edit({ roleId: "role-cashier" })).toEqual({ kind: "last_administrator" });
  });

  it("alerts when an administrator role is assigned", async () => {
    const { store, edit } = fixture();

    await edit({ roleId: "role-admin" });

    expect(store.snapshot().alerts).toMatchObject([
      { kind: "role_assigned", newRole: { isAdministrator: true } },
    ]);
  });

  it("refuses an email another user holds and leaves nothing behind", async () => {
    const { store, edit } = fixture({
      others: [user({ id: "u-2", email: "taken@example.test" })],
    });

    const outcome = await edit({ email: "taken@example.test", roleId: "role-manager" });

    expect(outcome).toEqual({ kind: "email_taken" });
    expect(store.snapshot().users[0]).toMatchObject({ version: 3, roleId: "role-cashier" });
    expect(store.snapshot().changes).toEqual([]);
  });

  it("refuses an email taken by a concurrent change", async () => {
    const { store, edit } = fixture();
    store.racedEmails.add("raced@example.test");

    expect(await edit({ email: "raced@example.test" })).toEqual({ kind: "email_taken" });
    expect(store.snapshot().users[0]).toMatchObject({ version: 3 });
  });

  it("takes its locks in order: administrator role, both roles, the user, then counts administrators", async () => {
    const { store, edit } = fixture();

    await edit({ email: "new@example.test", roleId: "role-manager" });

    expect(store.operationOrder).toEqual([
      "findRole",
      "lockAdministratorRole",
      "roleOfUser",
      "lockRoleForAssignment:role-cashier",
      "lockRoleForAssignment:role-manager",
      "lockUser",
      "activeAdministratorCount",
      "rewriteUser",
      "voidOutstandingRecoveryTokens",
      "recordUserChange",
      "openUserAlert",
      "reassignRole",
      "recordUserChange",
      "openUserAlert",
    ]);
  });

  it("locks no role when the role is kept", async () => {
    const { store, edit } = fixture();

    await edit();

    expect(store.operationOrder).toEqual([
      "findRole",
      "lockAdministratorRole",
      "roleOfUser",
      "lockUser",
      "activeAdministratorCount",
    ]);
  });

  it.each([
    "rewriteUser",
    "voidOutstandingRecoveryTokens",
    "recordUserChange",
    "openUserAlert",
    "reassignRole",
  ] as const)("leaves the user untouched when %s fails", async (operation) => {
    const { store, edit } = fixture();
    store.failingWrites.add(operation);

    await expect(edit({ email: "new@example.test", roleId: "role-manager" })).rejects.toThrow(
      `${operation} failed`,
    );

    const after = store.snapshot();
    expect(after.users[0]).toMatchObject({
      email: "u-1@example.test",
      roleId: "role-cashier",
      version: 3,
    });
    expect(after.changes).toEqual([]);
    expect(after.alerts).toEqual([]);
    expect(after.voidedRecoveryTokens).toEqual([]);
  });

  it("rolls the edit back when the user is no longer readable afterwards", async () => {
    const { store, edit } = fixture();
    const hidingUser: UserStore = {
      transaction: (work) =>
        store.transaction((tx) =>
          work(Object.create(tx, { users: { value: new FakeBranchUsers() } })),
        ),
    };

    await expect(edit({ email: "new@example.test" }, hidingUser)).rejects.toThrow(
      "edited user is no longer an active user of this branch",
    );

    expect(store.snapshot().users[0]).toMatchObject({ email: "u-1@example.test", version: 3 });
  });
});
