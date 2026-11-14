import type { RegisterCashSession } from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { readOpenSession } from "./sqlite-cash-ledger";

export class SqliteRegisterCashSession implements RegisterCashSession {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  isOpen(): boolean {
    return readOpenSession(this.database) !== undefined;
  }
}
