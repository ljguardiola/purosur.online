import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerPointTerminals, registers } from "../platform/db/schema.js";

export interface RegisterPointTerminal {
  terminalId: string | null;
  version: number;
}

const NEVER_ASSIGNED: RegisterPointTerminal = { terminalId: null, version: 0 };

export class DrizzleRegisterPointTerminalReader<TQueryResult extends PgQueryResultHKT> {
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async ofBranch(locationId: string): Promise<(registerId: string) => RegisterPointTerminal> {
    const rows = await this.db
      .select({
        registerId: registerPointTerminals.registerId,
        terminalId: registerPointTerminals.terminalId,
        version: registerPointTerminals.version,
      })
      .from(registerPointTerminals)
      .innerJoin(registers, eq(registers.id, registerPointTerminals.registerId))
      .where(eq(registers.locationId, locationId));
    const byRegister = new Map(
      rows.map(({ registerId, terminalId, version }) => [registerId, { terminalId, version }]),
    );
    return (registerId) => byRegister.get(registerId) ?? NEVER_ASSIGNED;
  }
}
