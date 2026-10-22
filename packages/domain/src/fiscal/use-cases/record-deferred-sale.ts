import type { OutboxEventDraft } from "../../shared/index.js";
import { type DeferredSale, randomShortCode, SHORT_CODE_ATTEMPTS } from "../model/deferred-sale.js";
import { deferredSaleRecordedEvent } from "../model/deferred-sale-recorded-event.js";
import type { DeferralReason } from "../model/real-time-authorization.js";
import { type ShortCodeRandomness, ShortCodeTaken } from "./deferred-sale-ports.js";
import type { IdGenerator, SaleOrigin } from "./sale-authorization-ports.js";

export interface DeferredSaleFacts {
  saleId: string;
  occurredAt: Date;
  total: number;
  reason: DeferralReason;
  routedAt: Date;
  origin: SaleOrigin;
}

export interface DeferredSaleRecording {
  sale: DeferredSale;
  event: OutboxEventDraft;
}

function recordingWith(
  id: string,
  eventId: string,
  shortCode: string,
  { origin, ...facts }: DeferredSaleFacts,
): DeferredSaleRecording {
  const sale = { id, shortCode, ...facts };
  return { sale, event: deferredSaleRecordedEvent({ eventId, ...origin, deferredSale: sale }) };
}

export function recordDeferredSale(
  record: (recording: DeferredSaleRecording) => void,
  ids: IdGenerator,
  shortCodes: ShortCodeRandomness,
  facts: DeferredSaleFacts,
): DeferredSale {
  const id = ids.next();
  const eventId = ids.next();
  for (let attempt = 1; ; attempt += 1) {
    const recording = recordingWith(
      id,
      eventId,
      randomShortCode((bound) => shortCodes.nextIndex(bound)),
      facts,
    );
    try {
      record(recording);
      return recording.sale;
    } catch (error) {
      if (!(error instanceof ShortCodeTaken) || attempt >= SHORT_CODE_ATTEMPTS) {
        throw error;
      }
    }
  }
}

export async function recordDeferredSaleAsync(
  record: (recording: DeferredSaleRecording) => Promise<void>,
  ids: IdGenerator,
  shortCodes: ShortCodeRandomness,
  facts: DeferredSaleFacts,
): Promise<DeferredSale> {
  const id = ids.next();
  const eventId = ids.next();
  for (let attempt = 1; ; attempt += 1) {
    const recording = recordingWith(
      id,
      eventId,
      randomShortCode((bound) => shortCodes.nextIndex(bound)),
      facts,
    );
    try {
      await record(recording);
      return recording.sale;
    } catch (error) {
      if (!(error instanceof ShortCodeTaken) || attempt >= SHORT_CODE_ATTEMPTS) {
        throw error;
      }
    }
  }
}
