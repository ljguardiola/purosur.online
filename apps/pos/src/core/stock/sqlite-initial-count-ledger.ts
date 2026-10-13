import type { OutboxEventDraft, RoleAccess } from "@purosur/domain";
import type {
  InitialCountLedger,
  InitialCountLine,
  InitialCountMovement,
  InitialCountTransaction,
} from "@purosur/domain/stock/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import {
  readActiveProductByBarcode,
  readActiveProductById,
  readSearchableProducts,
} from "../sales/sqlite-sellable-products";
import type { SignInStore } from "../sessions/sqlite-sign-in-store";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { addToStockBalance } from "./sqlite-stock-ledger";

interface LineRow {
  movement_id: string;
  product_id: string;
  product_name: string;
  sale_unit: string;
  counted: number;
  expires_on: string | null;
  confirmed_at: string;
  withdrawn: number;
}

const LINES = `SELECT stock_movements.id AS movement_id, stock_movements.product_id AS product_id,
         products.name AS product_name, products.sale_unit AS sale_unit,
         stock_movements.delta AS counted, stock_movements.expires_on AS expires_on,
         stock_movements.occurred_at AS confirmed_at,
         EXISTS (
           SELECT 1 FROM stock_movements AS withdrawal
           WHERE withdrawal.kind = 'opening_count_withdrawal'
             AND withdrawal.withdraws_movement_id = stock_movements.id
         ) AS withdrawn
       FROM stock_movements
       JOIN products ON products.id = stock_movements.product_id
       WHERE stock_movements.kind = 'opening_count'`;

function toLine(row: LineRow): InitialCountLine {
  return {
    movementId: row.movement_id,
    productId: row.product_id,
    productName: row.product_name,
    saleUnit: row.sale_unit as InitialCountLine["saleUnit"],
    counted: row.counted,
    expiresOn: row.expires_on,
    confirmedAt: new Date(row.confirmed_at),
    withdrawn: row.withdrawn === 1,
  };
}

export class SqliteInitialCountLedger implements InitialCountLedger {
  private readonly database: LocalDatabase;
  private readonly people: Pick<SignInStore, "activePerson">;
  private readonly outboxChainKey: string | undefined;

  constructor(
    database: LocalDatabase,
    people: Pick<SignInStore, "activePerson">,
    outboxChainKey?: string,
  ) {
    this.database = database;
    this.people = people;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: InitialCountTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): InitialCountTransaction {
    return {
      actorAccess: (userId): RoleAccess | undefined => this.people.activePerson(userId)?.access,
      branchFirstSessionOpened: () =>
        this.exists("SELECT 1 FROM branch_first_cash_sessions LIMIT 1"),
      ownSessionEverOpened: () => this.exists("SELECT 1 FROM cash_sessions LIMIT 1"),
      outboxReady: () => this.outboxChainKey !== undefined,
      activeProductById: (productId) => readActiveProductById(this.database, productId),
      activeProductByBarcode: (code) => readActiveProductByBarcode(this.database, code),
      searchableProducts: () => readSearchableProducts(this.database),
      initialCountLine: (movementId) => this.initialCountLine(movementId),
      notWithdrawnInitialCountLines: () => this.notWithdrawnInitialCountLines(),
      recordInitialCountMovement: (movement) => this.recordInitialCountMovement(movement),
      addToStockBalance: (productId, delta) => addToStockBalance(this.database, productId, delta),
      appendOutboxEvent: (draft) => this.appendOutboxEvent(draft),
    };
  }

  private exists(query: string): boolean {
    return this.database.prepare(query).get() !== undefined;
  }

  private initialCountLine(movementId: string): InitialCountLine | undefined {
    const row = this.database
      .prepare<[string], LineRow>(`${LINES} AND stock_movements.id = ?`)
      .get(movementId);
    return row && toLine(row);
  }

  private notWithdrawnInitialCountLines(): InitialCountLine[] {
    return this.database
      .prepare<[], LineRow>(LINES)
      .all()
      .map(toLine)
      .filter((line) => !line.withdrawn);
  }

  private recordInitialCountMovement(movement: InitialCountMovement): void {
    this.database
      .prepare(
        `INSERT INTO stock_movements (id, product_id, kind, delta, occurred_at, expires_on, withdraws_movement_id)
         VALUES (@id, @product_id, @kind, @delta, @occurred_at, @expires_on, @withdraws_movement_id)`,
      )
      .run({
        id: movement.id,
        product_id: movement.productId,
        kind: movement.kind,
        delta: movement.delta,
        occurred_at: movement.occurredAt.toISOString(),
        expires_on: movement.expiresOn,
        withdraws_movement_id: movement.withdrawsMovementId,
      });
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the ledger has no outbox chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}
