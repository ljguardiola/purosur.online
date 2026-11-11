import type {
  CashCountAtClose,
  RegisterCloses,
  RegisterIdentity,
} from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { readRegisterIdentity } from "./sqlite-cash-ledger";

interface LatestCloseRow {
  register_id: string;
  closed_at: string;
  counted_cash: number;
}

export class SqliteRegisterCloses implements RegisterCloses {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  registerIdentity(): RegisterIdentity | undefined {
    return readRegisterIdentity(this.database);
  }

  latestCloseOfEachRegister(): CashCountAtClose[] {
    return this.database
      .prepare<[], LatestCloseRow>(
        `SELECT register_id, closed_at, counted_cash
         FROM (
           SELECT register_id, closed_at, counted_cash,
             row_number() OVER (PARTITION BY register_id ORDER BY closed_at DESC, id DESC) AS position
           FROM cash_sessions WHERE state = 'CLOSED'
         )
         WHERE position = 1`,
      )
      .all()
      .map((row) => ({
        registerId: row.register_id,
        closedAt: new Date(row.closed_at),
        countedCash: row.counted_cash,
      }));
  }
}
