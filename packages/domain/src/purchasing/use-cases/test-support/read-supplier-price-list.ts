import { FakeZoneRulesSource } from "../../../shared/test-support/fake-zone-rules-source.js";
import type { AiCallUsage } from "../ai-call-usage.js";
import { FakePriceListExtractor } from "./fake-price-list-extractor.js";
import { FakeStoreCatalogs } from "./fake-store-catalogs.js";
import { FakeSupplierPriceListFiles } from "./fake-supplier-price-list-files.js";
import { FakeSupplierPriceListStore } from "./fake-supplier-price-list-store.js";

export const NOW = new Date("2026-03-11T01:30:00Z");
export const SENT_ON = "2026-03-10";
export const HTML = new Uint8Array([60, 104, 116, 109, 108, 62]);

export const readInput = { listId: "list-1", now: () => NOW, finalAttempt: false };

export function readingContext() {
  const store = new FakeSupplierPriceListStore();
  store.seedSupplier({ id: "supplier-a", name: "Distribuidora Sur", active: true });
  const files = new FakeSupplierPriceListFiles();
  const extractor = new FakePriceListExtractor();
  const storeCatalogs = new FakeStoreCatalogs();
  return {
    store,
    files,
    extractor,
    storeCatalogs,
    ports: { store, files, extractor, storeCatalogs, zoneRules: new FakeZoneRulesSource() },
  };
}

export function aUsage(
  overrides: Partial<AiCallUsage["attempts"][number]> = {},
  outcome: AiCallUsage["outcome"] = "completed",
): AiCallUsage {
  return {
    outcome,
    attempts: [
      {
        model: "claude-sonnet-5-5",
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        ...overrides,
      },
    ],
  };
}
