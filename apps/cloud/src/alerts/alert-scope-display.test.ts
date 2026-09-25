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

describe("scopeDisplay", () => {
  it("resolves a user-scoped kind's scope through the given name map", () => {
    const names = new Map([["user-1", "Lucía Pérez"]]);

    expect(scopeDisplay("user_email_changed", "user-1", names)).toBe("Lucía Pérez");
  });

  it("falls back to the raw scope when the user id isn't in the map", () => {
    const names = new Map<string, string>();

    expect(scopeDisplay("user_email_changed", "a-user-id", names)).toBe("a-user-id");
  });

  it("never looks the scope up for a source-address-scoped kind: it's already displayable", () => {
    const names = new Map([["203.0.113.5", "shouldn't matter"]]);

    expect(scopeDisplay("backoffice_sign_in_lockout", "203.0.113.5", names)).toBe("203.0.113.5");
  });

  it("falls back to the raw scope for a kind outside the catalog, instead of throwing", () => {
    const names = new Map([["scope_a", "shouldn't matter"]]);

    expect(scopeDisplay("kind_a", "scope_a", names)).toBe("scope_a");
  });
});
