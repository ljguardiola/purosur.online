import { readFileSync } from "node:fs";
import type { RECORDED_ORDER_SEARCHES } from "../mercado-pago-order-search-recording.js";

export interface RecordedOrderSearch {
  status: number;
  body: unknown;
}

export function recordedOrderSearch(
  name: (typeof RECORDED_ORDER_SEARCHES)[number],
): RecordedOrderSearch {
  return JSON.parse(
    readFileSync(new URL(`recorded-order-searches/${name}.json`, import.meta.url), "utf8"),
  );
}
