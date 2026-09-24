import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, locations, roles, userRoles, users } from "../db/schema.js";

export interface CreateFirstAdministratorInput {
  name: string;
  email: string;
}

export interface CreateFirstAdministratorResult {
  id: string;
  email: string;
}

export class InvalidFirstAdministratorInputError extends Error {
  readonly field: "name" | "email";

  constructor(field: "name" | "email", message: string) {
    super(message);
    this.name = "InvalidFirstAdministratorInputError";
    this.field = field;
  }
}

export class FirstAdministratorAlreadyBootstrappedError extends Error {
  constructor() {
    super("a user already exists; the first-administrator command only runs once");
    this.name = "FirstAdministratorAlreadyBootstrappedError";
  }
}

function normalizeName(rawName: string): string {
  const name = rawName.trim();
  if (name === "") {
    throw new InvalidFirstAdministratorInputError("name", "name must not be empty");
  }
  return name;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

function normalizeEmail(rawEmail: string): string {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email)) {
    throw new InvalidFirstAdministratorInputError("email", "email must look like local@domain");
  }
  return email;
}

/**
 * Creates the very first backoffice account: an Administrator with no passkeys yet. Refuses,
 * creating nothing, once any user exists, so it can never be used to mint a second administrator.
 */
export async function createFirstAdministrator<TQueryResult extends PgQueryResultHKT>(
  // Generic over the query-result kind so the same use case runs unchanged against the
  // production postgres-js database and the PGlite database used in tests.
  db: PgDatabase<TQueryResult>,
  input: CreateFirstAdministratorInput,
): Promise<CreateFirstAdministratorResult> {
  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);

  return db.transaction(async (tx) => {
    // Serializes concurrent runs: only one can pass the "no users yet" check below.
    await tx.execute(sql`LOCK TABLE users IN EXCLUSIVE MODE`);

    const existingUsers = await tx.select({ id: users.id }).from(users).limit(1);
    if (existingUsers.length > 0) {
      throw new FirstAdministratorAlreadyBootstrappedError();
    }

    const [administratorRole] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true))
      .limit(1);
    if (!administratorRole) {
      throw new Error("no Administrator role is seeded in the database");
    }

    const [location] = await tx.select({ id: locations.id }).from(locations).limit(1);
    if (!location) {
      throw new Error("no location is seeded in the database");
    }

    const [createdUser] = await tx
      .insert(users)
      .values({ firstName: name, email, locationId: location.id })
      .returning({ id: users.id });
    if (!createdUser) {
      throw new Error("inserting the first administrator returned no row");
    }

    await tx.insert(userRoles).values({ userId: createdUser.id, roleId: administratorRole.id });

    await tx.insert(auditLog).values({
      entity: "user",
      entityId: createdUser.id,
      actorId: createdUser.id,
      previousValue: null,
      newValue: { firstName: name, email, roleId: administratorRole.id },
    });

    return { id: createdUser.id, email };
  });
}
