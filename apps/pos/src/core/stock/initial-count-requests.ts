import type {
  FindCountableProductOutcome,
  ReadInitialCountOutcome,
  RecordInitialCountLineOutcome,
  SearchCountableProductsOutcome,
  WeighCountedProductOutcome,
  WithdrawInitialCountLineOutcome,
} from "@purosur/contracts";
import {
  type Clock,
  findCountableProductByBarcode,
  type InitialCountIds,
  type InitialCountLineView,
  readInitialCount,
  recordInitialCountLine,
  type Scale,
  searchCountableProductsByName,
  weighCountedProduct,
  withdrawInitialCountLine,
} from "@purosur/domain/stock/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { SqliteInitialCountLedger } from "./sqlite-initial-count-ledger";

export interface InitialCountRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  readOutboxChainKey: () => Promise<string | undefined>;
  now: Clock["now"];
  ids: InitialCountIds;
}

export interface RecordInitialCountLineRequest {
  productId: string;
  counted: number;
  expiresOn: string | null;
}

type GateRefusal = { kind: "not_signed_in" } | { kind: "not_permitted" };

function ledger(database: LocalDatabase, outboxChainKey?: string): SqliteInitialCountLedger {
  return new SqliteInitialCountLedger(database, new SqliteSignInStore(database), outboxChainKey);
}

function asCounter<Outcome>(
  gate: ActionGate,
  work: (actorId: string) => Outcome | Promise<Outcome>,
): Promise<{ kind: "performed"; result: Outcome } | GateRefusal> {
  return gate
    .run({ kind: "record_initial_inventory" }, ({ signedInUserId }) =>
      Promise.resolve(work(signedInUserId)),
    )
    .then((guarded) =>
      guarded.kind === "performed"
        ? guarded
        : { kind: guarded.kind === "not_signed_in" ? "not_signed_in" : "not_permitted" },
    );
}

function toWireLine(line: InitialCountLineView) {
  return {
    movement_id: line.movementId,
    product_id: line.productId,
    product_name: line.productName,
    sale_unit: line.saleUnit,
    counted: line.counted,
    expires_on: line.expiresOn,
  };
}

export async function readInitialCountFor({
  database,
  gate,
}: Pick<InitialCountRequestDeps, "database" | "gate">): Promise<ReadInitialCountOutcome> {
  const guarded = await asCounter(gate, (actorId) =>
    readInitialCount({ ledger: ledger(database) }, { actorId }),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { result } = guarded;
  return result.kind === "read"
    ? { kind: "read", offered: result.offered, lines: result.lines.map(toWireLine) }
    : { kind: result.kind };
}

export async function recordInitialCountLineFor(
  { database, gate, readOutboxChainKey, now, ids }: InitialCountRequestDeps,
  { productId, counted, expiresOn }: RecordInitialCountLineRequest,
): Promise<RecordInitialCountLineOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  const guarded = await asCounter(gate, (actorId) =>
    recordInitialCountLine(
      { ledger: ledger(database, outboxChainKey), clock: { now }, ids },
      { actorId, productId, counted, expiresOn },
    ),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { result } = guarded;
  return result.kind === "recorded"
    ? { kind: "recorded", line: toWireLine(result.line) }
    : { kind: result.kind };
}

export async function withdrawInitialCountLineFor(
  { database, gate, readOutboxChainKey, now, ids }: InitialCountRequestDeps,
  movementId: string,
): Promise<WithdrawInitialCountLineOutcome> {
  const outboxChainKey = await readOutboxChainKey();
  const guarded = await asCounter(gate, (actorId) =>
    withdrawInitialCountLine(
      { ledger: ledger(database, outboxChainKey), clock: { now }, ids },
      { actorId, movementId },
    ),
  );
  return guarded.kind === "performed" ? { kind: guarded.result.kind } : guarded;
}

export async function findCountableProductFor(
  { database, gate }: Pick<InitialCountRequestDeps, "database" | "gate">,
  code: string,
): Promise<FindCountableProductOutcome> {
  const guarded = await asCounter(gate, (actorId) =>
    findCountableProductByBarcode({ ledger: ledger(database) }, { actorId, code }),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { result } = guarded;
  return result.kind === "found"
    ? {
        kind: "found",
        product: {
          product_id: result.product.id,
          name: result.product.name,
          sale_unit: result.product.saleUnit,
        },
      }
    : { kind: result.kind };
}

export async function searchCountableProductsFor(
  { database, gate }: Pick<InitialCountRequestDeps, "database" | "gate">,
  query: string,
): Promise<SearchCountableProductsOutcome> {
  const guarded = await asCounter(gate, (actorId) =>
    searchCountableProductsByName({ ledger: ledger(database) }, { actorId, query }),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { result } = guarded;
  return result.kind === "results"
    ? {
        kind: "results",
        products: result.products.map((found) => ({
          product_id: found.productId,
          name: found.name,
          sale_unit: found.saleUnit,
          matches: found.matches,
        })),
        more: result.more,
      }
    : { kind: result.kind };
}

export async function weighCountedProductFor(
  { database, gate, scale }: Pick<InitialCountRequestDeps, "database" | "gate"> & { scale: Scale },
  productId: string,
): Promise<WeighCountedProductOutcome> {
  const guarded = await asCounter(gate, (actorId) =>
    weighCountedProduct({ ledger: ledger(database), scale }, { actorId, productId }),
  );
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const { result } = guarded;
  return result.kind === "weighed"
    ? { kind: "weighed", weight_thousandths: result.weightThousandths }
    : { kind: result.kind };
}
