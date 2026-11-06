import { compareCodeUnits, compareSpanishText } from "@purosur/domain";
import type { BranchRegister, BranchRegisters } from "@purosur/domain/register/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  registerEnrollmentCodes,
  registerInstallationBitlockerKeys,
  registerInstallations,
  registerPointsOfSale,
  registerPointTerminals,
  registerQrPointsOfSale,
  registers,
} from "../platform/db/schema.js";

const NEVER_ASSIGNED_VERSION = 0;

export class DrizzleBranchRegisterReader<TQueryResult extends PgQueryResultHKT>
  implements BranchRegisters
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
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
        pointOfSaleNumber: registerPointsOfSale.pointOfSaleNumber,
        pointTerminalId: registerPointTerminals.terminalId,
        pointTerminalVersion: registerPointTerminals.version,
        qrExternalPosId: registerQrPointsOfSale.externalPosId,
        qrPointOfSaleVersion: registerQrPointsOfSale.version,
      })
      .from(registers)
      .leftJoin(registerEnrollmentCodes, eq(registerEnrollmentCodes.registerId, registers.id))
      .leftJoin(registerPointsOfSale, eq(registerPointsOfSale.registerId, registers.id))
      .leftJoin(registerPointTerminals, eq(registerPointTerminals.registerId, registers.id))
      .leftJoin(registerQrPointsOfSale, eq(registerQrPointsOfSale.registerId, registers.id))
      .where(eq(registers.locationId, locationId));
    rows.sort((a, b) => compareSpanishText(a.name, b.name) || compareCodeUnits(a.id, b.id));
    const installations = await this.db
      .select({
        registerId: registerInstallations.registerId,
        hostname: registerInstallations.hostname,
        windowsVersion: registerInstallations.windowsVersion,
        enrolledAt: registerInstallations.enrolledAt,
        revokedAt: registerInstallations.revokedAt,
        bitlockerKeyLoaded: sql<boolean>`${registerInstallationBitlockerKeys.installationId} is not null`,
      })
      .from(registerInstallations)
      .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
      .leftJoin(
        registerInstallationBitlockerKeys,
        eq(registerInstallationBitlockerKeys.installationId, registerInstallations.id),
      )
      .where(eq(registers.locationId, locationId));
    return rows.map(
      ({
        id,
        name,
        issuedAt,
        expiresAt,
        redeemedAt,
        failedAttempts,
        pointOfSaleNumber,
        pointTerminalId,
        pointTerminalVersion,
        qrExternalPosId,
        qrPointOfSaleVersion,
      }) => ({
        id,
        name,
        enrollmentCode:
          issuedAt !== null && expiresAt !== null && failedAttempts !== null
            ? { issuedAt, expiresAt, redeemedAt, failedAttempts }
            : null,
        pointOfSaleNumber,
        pointTerminal: {
          terminalId: pointTerminalId,
          version: pointTerminalVersion ?? NEVER_ASSIGNED_VERSION,
        },
        qrPointOfSale: {
          externalPosId: qrExternalPosId,
          version: qrPointOfSaleVersion ?? NEVER_ASSIGNED_VERSION,
        },
        installations: installations
          .filter(({ registerId }) => registerId === id)
          .map(({ hostname, windowsVersion, enrolledAt, revokedAt, bitlockerKeyLoaded }) => ({
            hostname,
            windowsVersion,
            enrolledAt,
            revokedAt,
            bitlockerKeyLoaded,
          })),
      }),
    );
  }

  async hasRegister(locationId: string, registerId: string): Promise<boolean> {
    const [register] = await this.db
      .select({ id: registers.id })
      .from(registers)
      .where(and(eq(registers.id, registerId), eq(registers.locationId, locationId)))
      .limit(1);
    return register !== undefined;
  }
}
