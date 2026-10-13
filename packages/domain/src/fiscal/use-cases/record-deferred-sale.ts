import { type DeferredSale, randomShortCode } from "../model/deferred-sale.js";
import type { DeferralReason } from "../model/real-time-authorization.js";
import { type ShortCodeRandomness, ShortCodeTaken } from "./deferred-sale-ports.js";
import type { IdGenerator } from "./sale-authorization-ports.js";

export const SHORT_CODE_ATTEMPTS = 10;

export interface DeferredSaleFacts {
  saleId: string;
  occurredAt: Date;
  total: number;
  reason: DeferralReason;
  routedAt: Date;
}

function deferredSaleWith(id: string, shortCode: string, facts: DeferredSaleFacts): DeferredSale {
  return { id, shortCode, ...facts };
}

export function recordDeferredSale(
  record: (sale: DeferredSale) => void,
  ids: IdGenerator,
  shortCodes: ShortCodeRandomness,
  facts: DeferredSaleFacts,
): DeferredSale {
  const id = ids.next();
  for (let attempt = 1; ; attempt += 1) {
    const sale = deferredSaleWith(
      id,
      randomShortCode((bound) => shortCodes.nextIndex(bound)),
      facts,
    );
    try {
      record(sale);
      return sale;
    } catch (error) {
      if (!(error instanceof ShortCodeTaken) || attempt >= SHORT_CODE_ATTEMPTS) {
        throw error;
      }
    }
  }
}

export async function recordDeferredSaleAsync(
  record: (sale: DeferredSale) => Promise<void>,
  ids: IdGenerator,
  shortCodes: ShortCodeRandomness,
  facts: DeferredSaleFacts,
): Promise<DeferredSale> {
  const id = ids.next();
  for (let attempt = 1; ; attempt += 1) {
    const sale = deferredSaleWith(
      id,
      randomShortCode((bound) => shortCodes.nextIndex(bound)),
      facts,
    );
    try {
      await record(sale);
      return sale;
    } catch (error) {
      if (!(error instanceof ShortCodeTaken) || attempt >= SHORT_CODE_ATTEMPTS) {
        throw error;
      }
    }
  }
}
