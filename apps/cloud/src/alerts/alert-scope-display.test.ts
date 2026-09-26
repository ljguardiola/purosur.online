import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { roles, userRoles, users } from "../db/schema.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { loadScopeDisplayNames, scopeDisplay } from "./alert-scope-display.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function seededAdministratorRoleId(): Promise<string> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) throw new Error("test setup: no Administrator role seeded");
  return administratorRole.id;
}

async function insertUser(firstName: string): Promise<string> {
  const locationId = await seededLocationId(db);
  const roleId = await seededAdministratorRoleId();
  const [user] = await db
    .insert(users)
    .values({
      firstName,
      email: `${firstName.toLowerCase()}-${Math.random()}@example.com`,
      locationId,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("test setup: inserting the user returned no row");
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

describe("loadScopeDisplayNames", () => {
  it("maps each given user id to that user's first name", async () => {
    const luciaId = await insertUser("Lucía Pérez");
    const graceId = await insertUser("Grace Hopper");

    const names = await loadScopeDisplayNames(db, [luciaId, graceId]);

    expect(names.get(luciaId)).toBe("Lucía Pérez");
    expect(names.get(graceId)).toBe("Grace Hopper");
  });

  it("answers an empty map for an empty list, without querying", async () => {
    const names = await loadScopeDisplayNames(db, []);

    expect(names.size).toBe(0);
  });

  it("skips a scope that isn't a well-formed uuid instead of failing the whole lookup", async () => {
    const luciaId = await insertUser("Lucía Pérez");

    const names = await loadScopeDisplayNames(db, [luciaId, "203.0.113.5", "scope_a"]);

    expect(names.get(luciaId)).toBe("Lucía Pérez");
    expect(names.size).toBe(1);
  });
});

const CLOSED_AT = new Date("2026-01-05T13:00:00.000Z");

describe("scopeDisplay", () => {
  it("resolves a user-scoped kind's scope through the given name map", () => {
    const names = new Map([["user-1", "Lucía Pérez"]]);

    expect(
      scopeDisplay({ kind: "user_email_changed", scope: "user-1", resolvedAt: null }, names),
    ).toBe("Lucía Pérez");
  });

  it("falls back to the raw scope when the user id isn't in the map", () => {
    const names = new Map<string, string>();

    expect(
      scopeDisplay({ kind: "user_email_changed", scope: "a-user-id", resolvedAt: null }, names),
    ).toBe("a-user-id");
  });

  it("never looks the scope up for an open source-address-scoped kind: it's already displayable", () => {
    const names = new Map([["203.0.113.5", "shouldn't matter"]]);

    expect(
      scopeDisplay(
        { kind: "backoffice_sign_in_lockout", scope: "203.0.113.5", resolvedAt: null },
        names,
      ),
    ).toBe("203.0.113.5");
  });

  it("shows nothing for a closed source-address-scoped kind, whose scope no longer holds the address", () => {
    const names = new Map<string, string>();

    expect(
      scopeDisplay(
        { kind: "backoffice_sign_in_lockout", scope: "a-hashed-address", resolvedAt: CLOSED_AT },
        names,
      ),
    ).toBeNull();
  });

  it("falls back to the raw scope for a kind outside the catalog, instead of throwing", () => {
    const names = new Map([["scope_a", "shouldn't matter"]]);

    expect(scopeDisplay({ kind: "kind_a", scope: "scope_a", resolvedAt: null }, names)).toBe(
      "scope_a",
    );
  });
});
