import type { SearchableProduct } from "../../../catalog/index.js";
import type { RoleAccess } from "../../../permissions/index.js";
import type { OutboxEventDraft } from "../../../shared/index.js";
import type {
  CountableProduct,
  CountScale,
  CountScaleReading,
  InitialCountIds,
  InitialCountLedger,
  InitialCountLine,
  InitialCountMovement,
  InitialCountTransaction,
} from "../initial-count-ledger.js";

interface FakeCountableProduct extends CountableProduct {
  barcode?: string;
  timesSoldHere?: number;
}

export interface FakeInitialCountState {
  accesses: Record<string, RoleAccess>;
  branchFirstSessionOpened: boolean;
  ownSessionEverOpened: boolean;
  outboxReady: boolean;
  products: FakeCountableProduct[];
  movements: InitialCountMovement[];
  balances: Record<string, number>;
  outbox: OutboxEventDraft[];
}

export type FakeInitialCountWrite =
  | "recordInitialCountMovement"
  | "addToStockBalance"
  | "appendOutboxEvent";

export class FakeInitialCountLedger implements InitialCountLedger {
  state: FakeInitialCountState;
  lookups: string[] = [];
  barcodeLookups = 0;
  failingWrite: FakeInitialCountWrite | undefined;

  constructor(state: Partial<FakeInitialCountState> = {}) {
    this.state = {
      accesses: {},
      branchFirstSessionOpened: false,
      ownSessionEverOpened: false,
      outboxReady: true,
      products: [],
      movements: [],
      balances: {},
      outbox: [],
      ...state,
    };
  }

  transaction<TOutcome>(work: (tx: InitialCountTransaction) => TOutcome): TOutcome {
    const working = structuredClone(this.state);
    const look = (name: string) => this.lookups.push(name);
    const failIfAsked = (write: FakeInitialCountWrite) => {
      if (this.failingWrite === write) {
        throw new Error(`${write} failed`);
      }
    };
    const outcome = work({
      actorAccess: (userId) => {
        look("actorAccess");
        return working.accesses[userId];
      },
      branchFirstSessionOpened: () => {
        look("branchFirstSessionOpened");
        return working.branchFirstSessionOpened;
      },
      ownSessionEverOpened: () => {
        look("ownSessionEverOpened");
        return working.ownSessionEverOpened;
      },
      outboxReady: () => working.outboxReady,
      activeProductById: (productId) => {
        look("activeProductById");
        return countable(working.products.find((product) => product.id === productId));
      },
      activeProductByBarcode: (code) => {
        this.barcodeLookups += 1;
        return countable(working.products.find((product) => product.barcode === code));
      },
      searchableProducts: (): SearchableProduct[] =>
        working.products.map(({ id, name, saleUnit, timesSoldHere }) => ({
          id,
          name,
          saleUnit,
          timesSoldHere: timesSoldHere ?? 0,
        })),
      initialCountLine: (movementId) =>
        linesOf(working).find((line) => line.movementId === movementId),
      notWithdrawnInitialCountLines: () => linesOf(working).filter((line) => !line.withdrawn),
      recordInitialCountMovement: (movement) => {
        failIfAsked("recordInitialCountMovement");
        working.movements.push({ ...movement });
      },
      addToStockBalance: (productId, delta) => {
        failIfAsked("addToStockBalance");
        working.balances[productId] = (working.balances[productId] ?? 0) + delta;
      },
      appendOutboxEvent: (draft) => {
        failIfAsked("appendOutboxEvent");
        working.outbox.push(structuredClone(draft));
      },
    });
    this.state = working;
    return outcome;
  }
}

function countable(product: FakeCountableProduct | undefined): CountableProduct | undefined {
  return product && { id: product.id, name: product.name, saleUnit: product.saleUnit };
}

function linesOf(state: FakeInitialCountState): InitialCountLine[] {
  return state.movements
    .filter((movement) => movement.kind === "opening_count")
    .flatMap((movement) => {
      const product = state.products.find((candidate) => candidate.id === movement.productId);
      return product
        ? [
            {
              movementId: movement.id,
              productId: product.id,
              productName: product.name,
              saleUnit: product.saleUnit,
              counted: movement.delta,
              expiresOn: movement.expiresOn,
              confirmedAt: movement.occurredAt,
              withdrawn: state.movements.some(
                (other) =>
                  other.kind === "opening_count_withdrawal" &&
                  other.withdrawsMovementId === movement.id,
              ),
            },
          ]
        : [];
    });
}

export class SequentialIds implements InitialCountIds {
  private count = 0;

  next(): string {
    this.count += 1;
    return `id-${this.count}`;
  }
}

export class FakeCountScale implements CountScale {
  reads = 0;
  private readonly readings: CountScaleReading[];

  constructor(...readings: CountScaleReading[]) {
    this.readings = readings;
  }

  read(): Promise<CountScaleReading> {
    this.reads += 1;
    return Promise.resolve(this.readings.shift() ?? { kind: "unavailable" });
  }
}
