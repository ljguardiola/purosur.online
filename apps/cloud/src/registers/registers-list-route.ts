import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { registerEnrollmentCodes, registers } from "../db/schema.js";
import { checkRequestIsSameOrigin } from "../session/open-session.js";
import {
  openSessionOf,
  originGuard,
  permissionAccess,
  registerRouteAccess,
  routeSessionSource,
} from "../session/route-access.js";

export interface RegistersRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now?: () => Date;
}

export interface RegisterPendingCode {
  issuedAt: Date;
  expiresAt: Date;
}

export interface RegisterRow {
  id: string;
  name: string;
  /** The register's unexpired, unredeemed enrollment code, or `null` when it has none. */
  pendingCode: RegisterPendingCode | null;
}

export interface RegisterWire {
  id: string;
  name: string;
  pending_code: { issued_at: string; expires_at: string } | null;
}

export function toRegisterWire(row: RegisterRow): RegisterWire {
  return {
    id: row.id,
    name: row.name,
    pending_code: row.pendingCode
      ? {
          issued_at: row.pendingCode.issuedAt.toISOString(),
          expires_at: row.pendingCode.expiresAt.toISOString(),
        }
      : null,
  };
}

export async function listBranchRegisters<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  locationId: string,
  now: Date,
): Promise<RegisterRow[]> {
  const rows = await db
    .select({
      id: registers.id,
      name: registers.name,
      pendingCodeIssuedAt: registerEnrollmentCodes.issuedAt,
      pendingCodeExpiresAt: registerEnrollmentCodes.expiresAt,
    })
    .from(registers)
    .leftJoin(
      registerEnrollmentCodes,
      and(
        eq(registerEnrollmentCodes.registerId, registers.id),
        gt(registerEnrollmentCodes.expiresAt, now),
        isNull(registerEnrollmentCodes.redeemedAt),
      ),
    )
    .where(eq(registers.locationId, locationId))
    .orderBy(asc(registers.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    pendingCode:
      row.pendingCodeIssuedAt && row.pendingCodeExpiresAt
        ? { issuedAt: row.pendingCodeIssuedAt, expiresAt: row.pendingCodeExpiresAt }
        : null,
  }));
}

export function registerRegistersListRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegistersRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });

  app.get(
    "/registers",
    {
      preHandler: originGuard((request, reply) =>
        checkRequestIsSameOrigin(request, reply, options.backofficeOrigin),
      ),
      config: { access: permissionAccess("enroll_register_devices"), sessionSource },
    },
    async (request, reply) => {
      const openSession = openSessionOf(request);

      const rows = await listBranchRegisters(options.db, openSession.locationId, now());
      await reply.code(200).send(rows.map(toRegisterWire));
    },
  );
}
