import { registerCreationBodySchema } from "@purosur/contracts";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requirePasskeyAuthorization } from "../access/passkey-authorization-guard.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../access/route-access.js";
import { auditLog, registers } from "../platform/db/schema.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import type { RegistersRouteOptions } from "./registers-list-route.js";

const REGISTER_NAME_TAKEN_RESPONSE = {
  code: "register_name_taken",
  message: "a register with that name already exists in this branch",
} as const;

const UNIQUE_VIOLATION = "23505";
const REGISTER_NAME_UNIQUE_INDEX = "registers_location_id_name_lower_key";

class RegisterNameTaken extends Error {}

function isRegisterNameUniqueViolation(error: unknown): boolean {
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

export interface CreateRegisterInput {
  locationId: string;
  name: string;
  actorId: string;
}

interface CreatedRegister {
  id: string;
  name: string;
}

export type CreateRegisterOutcome =
  | { kind: "name_taken" }
  | { kind: "created"; register: CreatedRegister };

// Two concurrent requests can both pass the transaction's name check below; the database's own unique
// index is what actually stops the second insert, so its violation is caught too.
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

      const parsedBody = await readValidatedBody(reply, registerCreationBodySchema, request.body);
      if (!parsedBody) {
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
