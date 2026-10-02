import { describe, expect, it } from "vitest";
import {
  createFirstAdministrator,
  FirstAdministratorAlreadyBootstrappedError,
  InvalidFirstAdministratorInputError,
} from "./create-first-administrator.js";
import { FakeFirstAdministratorStore } from "./test-support/fake-first-administrator-store.js";

describe("createFirstAdministrator", () => {
  it("creates the user in the seeded location with the Administrator role and records it", async () => {
    const store = new FakeFirstAdministratorStore();

    const result = await createFirstAdministrator(
      { store },
      { name: "Ada Lovelace", email: "ada@example.com" },
    );

    expect(result).toEqual({ id: "user-1", email: "ada@example.com" });
    expect(store.snapshot()).toEqual({
      users: [
        { id: "user-1", firstName: "Ada Lovelace", email: "ada@example.com", locationId: "loc-1" },
      ],
      roleAssignments: [{ userId: "user-1", roleId: "role-admin" }],
      records: [
        {
          userId: "user-1",
          firstName: "Ada Lovelace",
          email: "ada@example.com",
          roleId: "role-admin",
        },
      ],
    });
  });

  it("locks the users, checks, inserts, assigns and records, in that order, in one transaction", async () => {
    const store = new FakeFirstAdministratorStore();

    await createFirstAdministrator({ store }, { name: "Ada", email: "ada@example.com" });

    expect(store.operationOrder).toEqual([
      "lockUsers",
      "anyUserExists",
      "findAdministratorRole",
      "findLocation",
      "insertUser",
      "assignRole",
      "recordFirstAdministrator",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("trims the name and trims and lowercases the email", async () => {
    const store = new FakeFirstAdministratorStore();

    const result = await createFirstAdministrator(
      { store },
      { name: "  Ada Lovelace  ", email: "  ADA@Example.com  " },
    );

    expect(result.email).toBe("ada@example.com");
    expect(store.snapshot().users[0]).toMatchObject({
      firstName: "Ada Lovelace",
      email: "ada@example.com",
    });
  });

  it("refuses when any user already exists and writes nothing", async () => {
    const store = new FakeFirstAdministratorStore();
    store.seedUser({
      id: "u-0",
      firstName: "Cashier",
      email: "c@example.com",
      locationId: "loc-1",
    });
    const before = store.snapshot();

    await expect(
      createFirstAdministrator({ store }, { name: "Ada", email: "ada@example.com" }),
    ).rejects.toBeInstanceOf(FirstAdministratorAlreadyBootstrappedError);

    expect(store.snapshot()).toEqual(before);
  });

  it("fails when no Administrator role is seeded", async () => {
    const store = new FakeFirstAdministratorStore();
    store.administratorRole = undefined;

    await expect(
      createFirstAdministrator({ store }, { name: "Ada", email: "ada@example.com" }),
    ).rejects.toThrow("no Administrator role is seeded in the database");
    expect(store.snapshot().users).toEqual([]);
  });

  it("fails when no location is seeded", async () => {
    const store = new FakeFirstAdministratorStore();
    store.location = undefined;

    await expect(
      createFirstAdministrator({ store }, { name: "Ada", email: "ada@example.com" }),
    ).rejects.toThrow("no location is seeded in the database");
    expect(store.snapshot().users).toEqual([]);
  });

  it.each([
    ["an empty name", { name: "   ", email: "ada@example.com" }, "name", "name must not be empty"],
    [
      "an email with no @",
      { name: "Ada", email: "not-an-email" },
      "email",
      "email must look like local@domain",
    ],
    [
      "an email containing spaces",
      { name: "Ada", email: "ada lovelace@example.com" },
      "email",
      "email must look like local@domain",
    ],
  ] as const)("rejects %s without opening a transaction", async (_name, input, field, message) => {
    const store = new FakeFirstAdministratorStore();

    const rejection = createFirstAdministrator({ store }, input);

    await expect(rejection).rejects.toBeInstanceOf(InvalidFirstAdministratorInputError);
    await expect(rejection).rejects.toMatchObject({ field, message });
    expect(store.transactionCount).toBe(0);
  });

  it("rejects an email with a second @", async () => {
    const store = new FakeFirstAdministratorStore();

    await expect(
      createFirstAdministrator({ store }, { name: "Ada", email: "ada@example@com" }),
    ).rejects.toBeInstanceOf(InvalidFirstAdministratorInputError);
  });

  it("names its refusals", async () => {
    expect(new FirstAdministratorAlreadyBootstrappedError()).toMatchObject({
      name: "FirstAdministratorAlreadyBootstrappedError",
      message: "a user already exists; the first-administrator command only runs once",
    });
    expect(new InvalidFirstAdministratorInputError("name", "m").name).toBe(
      "InvalidFirstAdministratorInputError",
    );
  });
});
