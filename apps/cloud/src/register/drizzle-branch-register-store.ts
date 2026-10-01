import {
  type BranchRegister,
  type BranchRegisterStore,
  type BranchRegisterStoreTransaction,
  type BranchRegisters,
  type EnrollmentCodeEmission,
  type EnrollmentCodeState,
  type LockRegisterResult,
  type NewEnrollmentCode,
  type NewRegister,
  type RegisterCreation,
  RegisterNameConflict,
} from "@purosur/domain/register/use-cases";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { auditLog, registerEnrollmentCodes, registers } from "../platform/db/schema.js";
import { UUID_PATTERN } from "../platform/db/uuid-pattern.js";
import { type PendingChanges, withPendingChanges } from "../sync/change-log.js";

const UNIQUE_VIOLATION = "23505";
const REGISTER_NAME_UNIQUE_INDEX = "registers_location_id_name_lower_key";

class DrizzleBranchRegisterStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements BranchRegisterStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges;

  constructor(tx: PgDatabase<TQueryResult>, pending: PendingChanges) {
    this.tx = tx;
    this.pending = pending;
  }

  async registerNameTaken(locationId: string, name: string): Promise<boolean> {
    const [existing] = await this.tx
      .select({ id: registers.id })
      .from(registers)
      .where(
        and(eq(registers.locationId, locationId), sql`lower(${registers.name}) = lower(${name})`),
      )
      .limit(1);
    return existing !== undefined;
  }

  async recordRegister(register: NewRegister): Promise<{ id: string }> {
    let recorded: { id: string; version: number } | undefined;
    try {
      [recorded] = await this.tx
        .insert(registers)
        .values({ locationId: register.locationId, name: register.name })
        .returning({ id: registers.id, version: registers.version });
    } catch (error) {
      if (
        postgresErrorChain(error).some(
          (link) =>
            link.code === UNIQUE_VIOLATION && link.constraint === REGISTER_NAME_UNIQUE_INDEX,
        )
      ) {
        throw new RegisterNameConflict();
      }
      throw error;
    }
    if (!recorded) {
      throw new Error("inserting the register returned no row");
    }
    this.pending.note({
      entity: "register",
      entityId: recorded.id,
      version: recorded.version,
      op: "insert",
    });
    return { id: recorded.id };
  }

  async recordRegisterCreation(creation: RegisterCreation): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "register",
      entityId: creation.registerId,
      actorId: creation.actorId,
      previousValue: null,
      newValue: { name: creation.name, location_id: creation.locationId },
    });
  }

  // NO KEY UPDATE leaves the foreign-key check of an enrollment redeeming this register's code free
  // to proceed, instead of deadlocking.
  async lockRegister(registerId: string): Promise<LockRegisterResult> {
    if (!UUID_PATTERN.test(registerId)) {
      return { kind: "not_found" };
    }
    const [register] = await this.tx
      .select({ id: registers.id })
      .from(registers)
      .where(eq(registers.id, registerId))
      .for("no key update");
    return register ? { kind: "locked" } : { kind: "not_found" };
  }

  async lockEnrollmentCode(registerId: string): Promise<EnrollmentCodeState | undefined> {
    const [code] = await this.tx
      .select({
        expiresAt: registerEnrollmentCodes.expiresAt,
        redeemedAt: registerEnrollmentCodes.redeemedAt,
        failedAttempts: registerEnrollmentCodes.failedAttempts,
      })
      .from(registerEnrollmentCodes)
      .where(eq(registerEnrollmentCodes.registerId, registerId))
      .for("update");
    return code;
  }

  // register_id is both primary and foreign key on register_enrollment_codes, so at most one code
  // row exists per register.
  async recordEnrollmentCode(code: NewEnrollmentCode): Promise<void> {
    const fields = {
      codeLookup: code.lookup,
      codeHash: code.codeHash,
      issuedAt: code.issuedAt,
      expiresAt: code.expiresAt,
      redeemedAt: null,
      failedAttempts: 0,
    };
    await this.tx
      .insert(registerEnrollmentCodes)
      .values({ registerId: code.registerId, ...fields })
      .onConflictDoUpdate({ target: registerEnrollmentCodes.registerId, set: fields });
  }

  async recordEnrollmentCodeEmission(emission: EnrollmentCodeEmission): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "register_enrollment_code",
      entityId: emission.registerId,
      actorId: emission.actorId,
      previousValue: emission.replacedCodeExpiresAt
        ? { expires_at: emission.replacedCodeExpiresAt.toISOString() }
        : null,
      newValue: { expires_at: emission.expiresAt.toISOString() },
    });
  }
}

export class DrizzleBranchRegisterStore<TQueryResult extends PgQueryResultHKT>
  implements BranchRegisterStore, BranchRegisters
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly pending: PendingChanges | undefined;

  constructor(db: PgDatabase<TQueryResult>, pending?: PendingChanges) {
    this.db = db;
    this.pending = pending;
  }

  transaction<TOutcome>(
    work: (tx: BranchRegisterStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPendingChanges(this.db, this.pending, (tx, pending) =>
      work(new DrizzleBranchRegisterStoreTransaction(tx, pending)),
    );
  }

  async branchRegisters(locationId: string): Promise<BranchRegister[]> {
    const rows = await this.db
      .select({
        id: registers.id,
        name: registers.name,
        issuedAt: registerEnrollmentCodes.issuedAt,
        expiresAt: registerEnrollmentCodes.expiresAt,
        redeemedAt: registerEnrollmentCodes.redeemedAt,
        failedAttempts: registerEnrollmentCodes.failedAttempts,
      })
      .from(registers)
      .leftJoin(registerEnrollmentCodes, eq(registerEnrollmentCodes.registerId, registers.id))
      .where(eq(registers.locationId, locationId))
      .orderBy(asc(registers.name));
    return rows.map(({ id, name, issuedAt, expiresAt, redeemedAt, failedAttempts }) => ({
      id,
      name,
      enrollmentCode:
        issuedAt !== null && expiresAt !== null && failedAttempts !== null
          ? { issuedAt, expiresAt, redeemedAt, failedAttempts }
          : null,
    }));
  }

  async belongsToBranch(locationId: string, registerId: string): Promise<boolean> {
    if (!UUID_PATTERN.test(registerId)) {
      return false;
    }
    const [register] = await this.db
      .select({ id: registers.id })
      .from(registers)
      .where(and(eq(registers.id, registerId), eq(registers.locationId, locationId)))
      .limit(1);
    return register !== undefined;
  }
}
