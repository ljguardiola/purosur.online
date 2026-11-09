import { isRegisterVersionAtLeast } from "../../register/index.js";
import type { StockMovementKind } from "../../stock/index.js";

const ENTITY_READABLE_SINCE: ReadonlyMap<string, string> = new Map([
  ["brand", "1.0.1364"],
  ["zone_rules", "1.0.1299"],
]);

const STOCK_MOVEMENT_KIND_READABLE_SINCE: Readonly<Partial<Record<StockMovementKind, string>>> = {
  return: "1.0.1284",
  assembly_void: "1.0.1322",
  exchange_out: "1.0.1490",
};

function readsSince(readerVersion: string | null, since: string | undefined): boolean {
  return (
    since === undefined ||
    (readerVersion !== null && isRegisterVersionAtLeast(readerVersion, since))
  );
}

export function readsPulledEntity(readerVersion: string | null, entity: string): boolean {
  return readsSince(readerVersion, ENTITY_READABLE_SINCE.get(entity));
}

export function unreadableStockMovementKinds(readerVersion: string | null): StockMovementKind[] {
  return (Object.keys(STOCK_MOVEMENT_KIND_READABLE_SINCE) as StockMovementKind[]).filter(
    (kind) => !readsSince(readerVersion, STOCK_MOVEMENT_KIND_READABLE_SINCE[kind]),
  );
}

export function readerVersionOf(
  declaredVersion: string | undefined,
  recordedVersion: string | null,
): string | null {
  return declaredVersion ?? recordedVersion;
}
