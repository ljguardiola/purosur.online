import { describe, expect, it, vi } from "vitest";
import { createUser } from "./create-user.js";
import { administrator, BRANCH, user } from "./test-support/branch-user-fixtures.js";
import { FakeUserStore } from "./test-support/fake-user-store.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const clock = { now: () => new Date(NOW) };

function fixture() {
  const store = new FakeUserStore();
  store.seedRole({
    id: "role-cashier",
    name: "Cajero",
    isAdministrator: false,
    permissionKeys: [],
  });
  store.seedRole({ id: "role-admin", name: null, isAdministrator: true, permissionKeys: [] });
  const create = (overrides: Partial<Parameters<typeof createUser>[1]> = {}) =>
    createUser(
      { store, clock },
      {
        firstName: "Marta",
        email: "marta@example.test",
        roleId: "role-cashier",
        locationId: BRANCH,
        actorId: "actor-1",
        actorMayReactivateUsers: true,
        ...overrides,
      },
    );
  return { store, create };
}

describe("createUser", () => {
  it("stores an active user with the role and answers with the created user", async () => {
    const { store, create } = fixture();

    const outcome = await create();

    expect(outcome).toEqual({
      kind: "created",
      user: {
        id: "new-user-1",
        firstName: "Marta",
        email: "marta@example.test",
        version: 1,
        active: true,
        roleId: "role-cashier",
        roleName: "Cajero",
        roleIsAdministrator: false,
        passkeyCount: 0,
        isLastActiveAdministrator: false,
      },
    });
    expect(store.snapshot().users).toEqual([
      {
        id: "new-user-1",
        locationId: BRANCH,
        firstName: "Marta",
        email: "marta@example.test",
        version: 1,
        active: true,
        roleId: "role-cashier",
        roleName: "Cajero",
        roleIsAdministrator: false,
        passkeyCount: 0,
      },
    ]);
  });

  it("records who created the user, with what name, email and role", async () => {
    const { store, create } = fixture();

    await create();

    expect(store.snapshot().changes).toEqual([
      {
        userId: "new-user-1",
        actorId: "actor-1",
        change: {
          kind: "created",
          firstName: "Marta",
          email: "marta@example.test",
          roleId: "role-cashier",
        },
      },
    ]);
  });

  it("opens no alert for a user that is not an administrator", async () => {
    const { store, create } = fixture();

    await create();

    expect(store.snapshot().alerts).toEqual([]);
  });

  it("opens an alert when the user is created as an administrator", async () => {
    const { store, create } = fixture();

    await create({ roleId: "role-admin" });

    expect(store.snapshot().alerts).toEqual([
      { kind: "created_as_administrator", userId: "new-user-1", actorId: "actor-1", openedAt: NOW },
    ]);
  });

  it("answers an administrator created in a branch with no other active one as its last active administrator", async () => {
    const { store, create } = fixture();
    store.seedUser(administrator({ id: "u-1", active: false }));
    store.seedUser(administrator({ id: "u-2", locationId: "branch-2" }));

    const outcome = await create({ roleId: "role-admin" });

    expect(outcome).toMatchObject({
      kind: "created",
      user: { roleIsAdministrator: true, isLastActiveAdministrator: true },
    });
  });

  it("answers an administrator created beside another active one as not the last", async () => {
    const { store, create } = fixture();
    store.seedUser(administrator({ id: "u-1" }));

    const outcome = await create({ roleId: "role-admin" });

    expect(outcome).toMatchObject({
      kind: "created",
      user: { roleIsAdministrator: true, isLastActiveAdministrator: false },
    });
  });

  it("refuses a role that does not exist and writes nothing", async () => {
    const { store, create } = fixture();

    const outcome = await create({ roleId: "role-missing" });

    expect(outcome).toEqual({ kind: "unknown_role" });
    expect(store.snapshot().users).toEqual([]);
    expect(store.snapshot().changes).toEqual([]);
  });

  it("refuses an email another user holds", async () => {
    const { store, create } = fixture();
    store.seedUser(user({ id: "u-1", email: "marta@example.test", active: true }));

    const outcome = await create();

    expect(outcome).toEqual({ kind: "email_taken" });
    expect(store.snapshot().users).toHaveLength(1);
    expect(store.snapshot().changes).toEqual([]);
  });

  it("refuses an email taken by a concurrent creation and leaves nothing behind", async () => {
    const { store, create } = fixture();
    store.racedEmails.add("marta@example.test");

    const outcome = await create();

    expect(outcome).toEqual({ kind: "email_taken" });
    expect(store.snapshot().users).toEqual([]);
    expect(store.snapshot().changes).toEqual([]);
  });

  it("offers reactivating the deactivated user of the branch who holds the email", async () => {
    const { store, create } = fixture();
    store.seedUser(
      user({ id: "u-1", firstName: "Marta Vieja", email: "marta@example.test", active: false }),
    );

    const outcome = await create();

    expect(outcome).toEqual({
      kind: "email_belongs_to_deactivated_user",
      id: "u-1",
      firstName: "Marta Vieja",
    });
  });

  it("does not offer reactivation to someone who may not reactivate users", async () => {
    const { store, create } = fixture();
    store.seedUser(user({ id: "u-1", email: "marta@example.test", active: false }));

    const outcome = await create({ actorMayReactivateUsers: false });

    expect(outcome).toEqual({ kind: "email_taken" });
  });

  it("looks no user up for someone who may not reactivate users", async () => {
    const { store, create } = fixture();
    store.seedUser(user({ id: "u-1", email: "marta@example.test", active: false }));

    await create({ actorMayReactivateUsers: false });

    expect(store.users.lookups).toEqual([]);
  });

  it("looks the email up only among the deactivated users of the requester's branch", async () => {
    const { store, create } = fixture();
    store.seedUser(
      user({ id: "u-1", email: "marta@example.test", active: false, locationId: "branch-2" }),
    );
    const branchUserWithEmail = vi.spyOn(store.users, "branchUserWithEmail");

    await create();

    expect(branchUserWithEmail).toHaveBeenCalledWith(BRANCH, "marta@example.test", "inactive");
    expect(store.users.lookups).toEqual(["branchUserWithEmail"]);
  });

  it("does not reveal a deactivated user of another branch", async () => {
    const { store, create } = fixture();
    store.seedUser(
      user({ id: "u-1", email: "marta@example.test", active: false, locationId: "branch-2" }),
    );

    const outcome = await create();

    expect(outcome).toEqual({ kind: "email_taken" });
  });

  it("does not offer reactivating an active holder", async () => {
    const { store, create } = fixture();
    store.seedUser(administrator({ id: "u-1", email: "marta@example.test" }));

    const outcome = await create();

    expect(outcome).toEqual({ kind: "email_taken" });
  });

  it("looks the role up, inserts the user, assigns the role, audits, alerts, then counts administrators", async () => {
    const { store, create } = fixture();

    await create({ roleId: "role-admin" });

    expect(store.operationOrder).toEqual([
      "findRole",
      "insertUser",
      "assignRole",
      "recordUserChange",
      "openUserAlert",
      "activeAdministratorCount",
    ]);
  });

  it.each(["insertUser", "assignRole", "recordUserChange", "openUserAlert"] as const)(
    "leaves nothing behind when %s fails",
    async (operation) => {
      const { store, create } = fixture();
      store.failingWrites.add(operation);

      await expect(create({ roleId: "role-admin" })).rejects.toThrow(`${operation} failed`);

      const after = store.snapshot();
      expect(after.users).toEqual([]);
      expect(after.changes).toEqual([]);
      expect(after.alerts).toEqual([]);
    },
  );
});
