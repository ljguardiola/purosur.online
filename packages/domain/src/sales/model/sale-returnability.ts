import type { SaleState } from "./sale.js";

export function saleMayBeReturned(state: SaleState): boolean {
  return state === "COMPLETED";
}
