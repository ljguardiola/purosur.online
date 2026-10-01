import type { FirstAdministratorStore } from "./first-administrator-store.js";

export interface CreateFirstAdministratorPorts {
  store: FirstAdministratorStore;
}

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

export async function createFirstAdministrator(
  { store }: CreateFirstAdministratorPorts,
  input: CreateFirstAdministratorInput,
): Promise<CreateFirstAdministratorResult> {
  const name = normalizeName(input.name);
  const email = normalizeEmail(input.email);

  return store.transaction(async (tx) => {
    await tx.lockUsers();
    if (await tx.anyUserExists()) {
      throw new FirstAdministratorAlreadyBootstrappedError();
    }

    const administratorRole = await tx.findAdministratorRole();
    if (!administratorRole) {
      throw new Error("no Administrator role is seeded in the database");
    }
    const location = await tx.findLocation();
    if (!location) {
      throw new Error("no location is seeded in the database");
    }

    const created = await tx.insertUser({ firstName: name, email, locationId: location.id });
    await tx.assignRole(created.id, administratorRole.id);
    await tx.recordFirstAdministrator(created.id, {
      firstName: name,
      email,
      roleId: administratorRole.id,
    });
    return { id: created.id, email };
  });
}
