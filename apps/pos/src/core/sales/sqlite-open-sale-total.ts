import { amountToCharge } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";
import { readOpenSale } from "./sqlite-open-sale";

export function openSaleTotalOf(database: LocalDatabase, sessionId: string): number | undefined {
  const sale = readOpenSale(database, sessionId);
  return sale && amountToCharge(sale);
}
