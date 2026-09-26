import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, registers } from "../db/schema.js";
import { requirePasskeyAuthorization } from "../session/passkey-authorization-guard.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import {
  type RegisterFieldValidationFailure,
  readRegisterName,
  registerNameValidationFailure,
} from "./register-validation.js";
import type { RegistersRouteOptions } from "./registers-list-route.js";

export const REGISTER_NAME_TAKEN_RESPONSE = {
  code: "register_name_taken",
  message: "a register with that name already exists in this branch",
} as const;

const UNIQUE_VIOLATION = "23505";
const REGISTER_NAME_UNIQUE_INDEX = "registers_location_id_name_lower_key";

export class RegisterNameTaken extends Error {}

/**
 * Walks the driver error (wrapped by Drizzle as its `cause`) for a unique violation on the
 * case-insensitive-per-branch `registers` index, the same shape `isCategoryNameUniqueViolation`
 * (`category-creation-route.ts`) maps for `categories.name`.
 */
export function isRegisterNameUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code, constraint, constraint_name } = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
    };
    const index = constraint_name ?? constraint;
    if (code === UNIQUE_VIOLATION && index === REGISTER_NAME_UNIQUE_INDEX) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

interface CreationRequestBody {
  name: string;
}

function readCreationBody(body: unknown): CreationRequestBody | RegisterFieldValidationFailure {
  const name = readRegisterName(body);
  const nameFailure = registerNameValidationFailure(name);
  if (nameFailure) {
    return nameFailure;
  }
  if (!name) {
    // Unreachable: `registerNameValidationFailure` above already rejects an empty or missing name.
    return { field: "name", message: "name must not be empty" };
  }
  return { name };
}

function isValidationFailure(
  value: CreationRequestBody | RegisterFieldValidationFailure,
): value is RegisterFieldValidationFailure {
  return "field" in value;
}

export interface CreateRegisterInput {
  locationId: string;
  name: string;
  actorId: string;
}

export interface CreatedRegister {
  id: string;
  name: string;
}

export type CreateRegisterOutcome =
  | { kind: "name_taken" }
  | { kind: "created"; register: CreatedRegister };

/**
 * Creates a register and an audit row in one transaction, scoped to the branch it belongs to. The
 * name uniqueness check runs first, inside the transaction; the database's own
 * case-insensitive-per-branch unique index (`registers_location_id_name_lower_key`) is the backstop
 * for a name that lands concurrently, mapped by `isRegisterNameUniqueViolation` the same way
 * `createCategory` (`category-creation-route.ts`) maps its own.
 */
export async function createRegister<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: CreateRegisterInput,
): Promise<CreateRegisterOutcome> {
  const created = await db
    .transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: registers.id })
        .from(registers)
        .where(
          and(
            eq(registers.locationId, input.locationId),
            sql`lower(${registers.name}) = lower(${input.name})`,
          ),
        )
        .limit(1);
      if (existing) {
        throw new RegisterNameTaken();
      }

      const [newRegister] = await tx
        .insert(registers)
        .values({ locationId: input.locationId, name: input.name })
        .returning({ id: registers.id, name: registers.name });
      if (!newRegister) {
        throw new Error("inserting the register returned no row");
      }

      await tx.insert(auditLog).values({
        entity: "register",
        entityId: newRegister.id,
        actorId: input.actorId,
        previousValue: null,
        newValue: { name: newRegister.name, location_id: input.locationId },
      });

      return newRegister;
    })
    .catch((error: unknown) => {
      if (error instanceof RegisterNameTaken || isRegisterNameUniqueViolation(error)) {
        return undefined;
      }
      throw error;
    });

  if (!created) {
    return { kind: "name_taken" };
  }
  return { kind: "created", register: created };
}

/**
 * Registers `POST /registers`: creates a register in the session's own branch ("Nueva caja"),
 * gated by the `enroll_register_devices` permission (an Administrator always holds it too) and the
 * shared passkey-authorization window (`passkey-authorization-guard.ts`), the same combination
 * `POST /roles` (`role-creation-route.ts`) requires for its own sensitive creation. Body validation
 * runs before the passkey check, the same order `role-creation-route.ts` uses.
 */
export function registerRegisterCreationRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegistersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  function checkOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.headers.origin !== options.backofficeOrigin) {
      void reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return false;
    }
    return true;
  }

  app.post(
    "/registers",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: permissionAccess("enroll_register_devices"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const parsedBody = readCreationBody(request.body);
      if (isValidationFailure(parsedBody)) {
        await reply.code(400).send({
          code: "validation_failed",
          message: parsedBody.message,
          details: [{ field: parsedBody.field }],
        });
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const outcome = await createRegister(options.db, {
        locationId: openSession.locationId,
        name: parsedBody.name,
        actorId: openSession.userId,
      });

      if (outcome.kind === "name_taken") {
        await reply.code(409).send(REGISTER_NAME_TAKEN_RESPONSE);
        return;
      }

      await reply.code(201).send(outcome.register);
    },
  );
}
