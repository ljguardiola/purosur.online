import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, registerEnrollmentCodes, registers } from "../db/schema.js";
import { requirePasskeyAuthorization } from "../session/passkey-authorization-guard.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";
import {
  generateRegisterEnrollmentCode,
  hashRegisterEnrollmentCode,
} from "./register-enrollment-code.js";
import type { RegistersRouteOptions } from "./registers-list-route.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id and one that simply doesn't belong to this branch answer alike, the same
 * "none of the two ever leaks which one it was" reasoning `user-deactivation-route.ts` applies to a
 * user id. */
const REGISTER_NOT_FOUND_RESPONSE = {
  code: "not_found",
  message: "no register with that id belongs to this branch",
} as const;

/** 15 minutes from the moment a code is emitted, the design doc's own window for it. */
export const REGISTER_ENROLLMENT_CODE_WINDOW_MS = 15 * 60 * 1000;

/** Finds `registerId` only when it belongs to `locationId`; otherwise `undefined`, same as a missing id. */
async function findBranchRegister<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
  registerId: string,
): Promise<{ id: string } | undefined> {
  if (!UUID_PATTERN.test(registerId)) {
    return undefined;
  }
  const [row] = await db
    .select({ id: registers.id })
    .from(registers)
    .where(and(eq(registers.id, registerId), eq(registers.locationId, locationId)))
    .limit(1);
  return row;
}

export interface EmitRegisterEnrollmentCodeInput {
  registerId: string;
  actorId: string;
  now: Date;
}

export interface EmittedRegisterEnrollmentCode {
  code: string;
  expiresAt: Date;
}

/**
 * Replaces the register's pending enrollment code (there is ever only one, `register_id` being
 * both primary and foreign key on `register_enrollment_codes`) and audits it, in one transaction.
 * The audit row records only the new `expires_at`, and the previous one when this emission replaced
 * a still-pending code: the code and its hash never appear in it.
 */
export async function emitRegisterEnrollmentCode<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  input: EmitRegisterEnrollmentCodeInput,
): Promise<EmittedRegisterEnrollmentCode> {
  const rawCode = generateRegisterEnrollmentCode();
  const expiresAt = new Date(input.now.getTime() + REGISTER_ENROLLMENT_CODE_WINDOW_MS);

  await db.transaction(async (tx) => {
    // The register row always exists, unlike its code row before the first emission, so locking it
    // is what serializes two emissions for the same register.
    await tx
      .select({ id: registers.id })
      .from(registers)
      .where(eq(registers.id, input.registerId))
      .for("update");

    const [previous] = await tx
      .select({
        expiresAt: registerEnrollmentCodes.expiresAt,
        redeemedAt: registerEnrollmentCodes.redeemedAt,
      })
      .from(registerEnrollmentCodes)
      .where(eq(registerEnrollmentCodes.registerId, input.registerId))
      .for("update");
    const replacedPendingCode =
      previous && previous.redeemedAt === null && previous.expiresAt > input.now
        ? previous
        : undefined;

    await tx
      .insert(registerEnrollmentCodes)
      .values({
        registerId: input.registerId,
        codeHash: hashRegisterEnrollmentCode(rawCode),
        issuedAt: input.now,
        expiresAt,
        redeemedAt: null,
        failedAttempts: 0,
      })
      .onConflictDoUpdate({
        target: registerEnrollmentCodes.registerId,
        set: {
          codeHash: hashRegisterEnrollmentCode(rawCode),
          issuedAt: input.now,
          expiresAt,
          redeemedAt: null,
          failedAttempts: 0,
        },
      });

    await tx.insert(auditLog).values({
      entity: "register_enrollment_code",
      entityId: input.registerId,
      actorId: input.actorId,
      previousValue: replacedPendingCode
        ? { expires_at: replacedPendingCode.expiresAt.toISOString() }
        : null,
      newValue: { expires_at: expiresAt.toISOString() },
    });
  });

  return { code: rawCode, expiresAt };
}

/**
 * Registers `POST /registers/:id/enrollment-code`: emits a fresh, single-use enrollment code for a
 * register of the session's own branch (404 for a malformed, missing, or other-branch id, the same
 * "identical 404" shape `user-deactivation-route.ts` uses for its own target lookup), gated by the
 * `enroll_register_devices` permission (an Administrator always holds it too) and the shared
 * passkey-authorization window (`passkey-authorization-guard.ts`). The register lookup runs before
 * the passkey check, the same order `user-deactivation-route.ts` uses for its own target lookup.
 */
export function registerRegisterEnrollmentCodeRoute<TQueryResult extends PgQueryResultHKT>(
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

  app.post<{ Params: { id: string } }>(
    "/registers/:id/enrollment-code",
    {
      preHandler: originGuard(checkOrigin),
      config: { access: permissionAccess("enroll_register_devices"), sessionSource },
    },
    async (request, reply) => {
      const attemptedAt = now();
      const openSession = openSessionOf(request);

      const target = await findBranchRegister(
        options.db,
        openSession.locationId,
        request.params.id,
      );
      if (!target) {
        await reply.code(404).send(REGISTER_NOT_FOUND_RESPONSE);
        return;
      }

      if (!(await requirePasskeyAuthorization(openSession, reply, attemptedAt))) {
        return;
      }

      const emitted = await emitRegisterEnrollmentCode(options.db, {
        registerId: target.id,
        actorId: openSession.userId,
        now: attemptedAt,
      });

      await reply
        .code(200)
        .send({ code: emitted.code, expires_at: emitted.expiresAt.toISOString() });
    },
  );
}
