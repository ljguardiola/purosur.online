import {
  type LockBranchRegisterResult,
  type PointOfSaleClaim,
  PointOfSaleClaimConflict,
  type PointOfSaleHolder,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { pointOfSaleClaims, registers } from "../platform/db/schema.js";

const UNIQUE_VIOLATION = "23505";
const POINT_OF_SALE_CLAIM_KEYS = [
  "point_of_sale_claims_pkey",
  "point_of_sale_claims_number_register_mechanism_key",
];

// NO KEY UPDATE leaves the foreign-key check of an enrollment redeeming this register's code free
// to proceed, instead of deadlocking.
export async function lockBranchRegister<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  locationId: string,
  registerId: string,
): Promise<LockBranchRegisterResult> {
  const [register] = await tx
    .select({ id: registers.id })
    .from(registers)
    .where(and(eq(registers.id, registerId), eq(registers.locationId, locationId)))
    .for("no key update");
  return register ? { kind: "locked" } : { kind: "not_found" };
}

// Claims are append-only, so cloud_app holds no UPDATE on them and cannot lock the row; a claim
// that a concurrent register inserts first surfaces as a PointOfSaleClaimConflict from
// claimPointOfSale.
export async function lockPointOfSaleClaim<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  pointOfSaleNumber: number,
): Promise<PointOfSaleHolder | undefined> {
  const [claim] = await tx
    .select({ registerId: pointOfSaleClaims.registerId, mechanism: pointOfSaleClaims.mechanism })
    .from(pointOfSaleClaims)
    .where(eq(pointOfSaleClaims.pointOfSaleNumber, pointOfSaleNumber));
  return claim;
}

export async function claimPointOfSale<TQueryResult extends PgQueryResultHKT>(
  tx: PgDatabase<TQueryResult>,
  claim: PointOfSaleClaim,
): Promise<void> {
  try {
    await tx.insert(pointOfSaleClaims).values({
      pointOfSaleNumber: claim.pointOfSaleNumber,
      registerId: claim.registerId,
      mechanism: claim.mechanism,
      claimedBy: claim.actorId,
    });
  } catch (error) {
    if (
      postgresErrorChain(error).some(
        (link) =>
          link.code === UNIQUE_VIOLATION &&
          typeof link.constraint === "string" &&
          POINT_OF_SALE_CLAIM_KEYS.includes(link.constraint),
      )
    ) {
      throw new PointOfSaleClaimConflict();
    }
    throw error;
  }
}
