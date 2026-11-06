import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { AiCallUsage } from "./ai-call-usage.js";
import { proposeSupplierItemQuantity } from "./propose-supplier-item-quantity.js";
import { FakeSupplierItemLinkProposalReader } from "./test-support/fake-supplier-item-link-proposal-reader.js";
import { FakeSupplierItemProposalStore } from "./test-support/fake-supplier-item-proposal-store.js";
import { FakeSupplierItemQuantityReader } from "./test-support/fake-supplier-item-quantity-reader.js";
import { FakeSupplierPriceListAiCallStore } from "./test-support/fake-supplier-price-list-ai-call-store.js";

function setup() {
  const reader = new FakeSupplierItemLinkProposalReader({
    rows: [
      {
        listId: "list-1",
        id: "row-1",
        description: "Aceite de palta 250 ml",
        presentation: "x3 packs",
        barcode: null,
      },
      {
        listId: "list-1",
        id: "row-2",
        description: "Aceite de palta 250 ml",
        presentation: "Pack x12u",
        barcode: null,
      },
    ],
  });
  const quantityReader = new FakeSupplierItemQuantityReader();
  const aiCalls = new FakeSupplierPriceListAiCallStore();
  const store = new FakeSupplierItemProposalStore();
  return {
    quantityReader,
    aiCalls,
    store,
    ports: { reader, quantityReader, aiCalls, store, zoneRules: new FakeZoneRulesSource() },
  };
}

const NOW = new Date("2026-03-11T01:30:00Z");
const input = {
  listId: "list-1",
  rowId: "row-1",
  actorId: "person-1",
  now: () => NOW,
  saleUnit: "UNIT" as const,
  netContent: { quantity: 250, unit: "ML" as const },
  refresh: false,
};

const usage = (outcome: AiCallUsage["outcome"]): AiCallUsage => ({
  outcome,
  attempts: [
    {
      model: "claude-sonnet-5-5",
      inputTokens: 2_000,
      outputTokens: 100,
      cacheWriteTokens: 10,
      cacheReadTokens: 1_000,
    },
  ],
});

describe("proposeSupplierItemQuantity", () => {
  it("answers not_found for a row that does not exist, without reading", async () => {
    const { quantityReader, aiCalls, ports } = setup();

    expect(await proposeSupplierItemQuantity(ports, { ...input, rowId: "missing" })).toEqual({
      kind: "not_found",
    });
    expect(quantityReader.asked).toEqual([]);
    expect(aiCalls.recordings).toBe(0);
  });

  it("answers not_found for a row of another list", async () => {
    const { ports } = setup();

    expect(await proposeSupplierItemQuantity(ports, { ...input, listId: "other" })).toEqual({
      kind: "not_found",
    });
  });

  it("gives the reader the item, its other presentations and the sale unit and net content", async () => {
    const { quantityReader, ports } = setup();

    await proposeSupplierItemQuantity(ports, input);

    expect(quantityReader.asked).toEqual([
      {
        item: {
          description: "Aceite de palta 250 ml",
          presentation: "x3 packs",
          otherPresentations: ["Pack x12u"],
        },
        product: { saleUnit: "UNIT", netContent: { quantity: 250, unit: "ML" } },
      },
    ]);
  });

  it("gives the reader no net content when the product has none", async () => {
    const { quantityReader, ports } = setup();

    await proposeSupplierItemQuantity(ports, { ...input, saleUnit: "KG", netContent: null });

    expect(quantityReader.asked[0]?.product).toEqual({ saleUnit: "KG", netContent: null });
  });

  it("proposes the quantity the reader read", async () => {
    const { quantityReader, ports } = setup();
    quantityReader.answer = { kind: "read", quantity: 36_000 };

    expect(await proposeSupplierItemQuantity(ports, input)).toEqual({
      kind: "proposed",
      quantity: 36_000,
    });
  });

  it("proposes a quantity in grams of a product sold by weight", async () => {
    const { quantityReader, ports } = setup();
    quantityReader.answer = { kind: "read", quantity: 5_000 };

    expect(
      await proposeSupplierItemQuantity(ports, { ...input, saleUnit: "KG", netContent: null }),
    ).toEqual({ kind: "proposed", quantity: 5_000 });
  });

  it("proposes nothing when the reader answers a quantity the product's sale unit cannot hold", async () => {
    const { quantityReader, ports } = setup();
    quantityReader.answer = { kind: "read", quantity: 2_500 };

    expect(await proposeSupplierItemQuantity(ports, { ...input, saleUnit: "UNIT" })).toEqual({
      kind: "none",
    });
  });

  it("proposes nothing when the reader cannot tell the quantity", async () => {
    const { quantityReader, ports } = setup();
    quantityReader.answer = { kind: "none" };

    expect(await proposeSupplierItemQuantity(ports, input)).toEqual({ kind: "none" });
  });

  it("answers unavailable when the reader is unavailable", async () => {
    const { quantityReader, ports } = setup();
    quantityReader.answer = { kind: "unavailable" };

    expect(await proposeSupplierItemQuantity(ports, input)).toEqual({ kind: "unavailable" });
  });

  it("answers unavailable when the reader fails", async () => {
    const { quantityReader, ports } = setup();
    quantityReader.answer = new Error("network down");

    expect(await proposeSupplierItemQuantity(ports, input)).toEqual({ kind: "unavailable" });
  });

  describe("recording of the AI calls", () => {
    it("records each attempt the reader reports for the row, the person and the moment", async () => {
      const { quantityReader, aiCalls, ports } = setup();
      quantityReader.answer = { kind: "read", quantity: 36_000 };
      quantityReader.reportedCalls = [usage("completed")];

      await proposeSupplierItemQuantity(ports, input);

      expect(aiCalls.recorded).toEqual([
        {
          purpose: "LINK_PROPOSAL",
          listId: "list-1",
          rowId: "row-1",
          actorId: "person-1",
          occurredAt: NOW,
          occurredOn: "2026-03-10",
          model: "claude-sonnet-5-5",
          inputTokens: 2_000,
          outputTokens: 100,
          cacheWriteTokens: 10,
          cacheReadTokens: 1_000,
          outcome: "completed",
          costNanoUsd: 4_000_000 + 1_000_000 + 25_000 + 200_000,
        },
      ]);
    });

    it("records the calls reported before the reader throws, answering unavailable", async () => {
      const { quantityReader, aiCalls, ports } = setup();
      quantityReader.answer = new Error("connection reset");
      quantityReader.reportedCalls = [usage("cut_short")];

      expect(await proposeSupplierItemQuantity(ports, input)).toEqual({ kind: "unavailable" });

      expect(aiCalls.recorded).toEqual([expect.objectContaining({ outcome: "cut_short" })]);
    });

    it("records the calls of an unavailable reading", async () => {
      const { quantityReader, aiCalls, ports } = setup();
      quantityReader.answer = { kind: "unavailable" };
      quantityReader.reportedCalls = [usage("failed")];

      await proposeSupplierItemQuantity(ports, input);

      expect(aiCalls.recorded).toEqual([expect.objectContaining({ outcome: "failed" })]);
    });

    it("records nothing when the reader reports no attempt", async () => {
      const { quantityReader, aiCalls, ports } = setup();
      quantityReader.reportedCalls = [{ outcome: "failed", attempts: [] }];

      await proposeSupplierItemQuantity(ports, input);

      expect(aiCalls.recordings).toBe(0);
    });

    it("does not answer when the calls cannot be recorded", async () => {
      const { quantityReader, aiCalls, ports } = setup();
      quantityReader.reportedCalls = [usage("completed")];
      aiCalls.failure = new Error("storage down");

      await expect(proposeSupplierItemQuantity(ports, input)).rejects.toThrow("storage down");
    });
  });

  describe("keeping the proposal", () => {
    const refresh = { ...input, refresh: true };

    it("shows the kept quantity on a second request of the same shape, without reading or recording", async () => {
      const { quantityReader, aiCalls, ports } = setup();
      quantityReader.answer = { kind: "read", quantity: 36_000 };
      quantityReader.reportedCalls = [usage("completed")];
      await proposeSupplierItemQuantity(ports, input);

      expect(await proposeSupplierItemQuantity(ports, input)).toEqual({
        kind: "proposed",
        quantity: 36_000,
      });
      expect(quantityReader.asked).toHaveLength(1);
      expect(aiCalls.recorded).toHaveLength(1);
    });

    it("keeps that the reader could not tell the quantity", async () => {
      const { quantityReader, ports } = setup();
      quantityReader.answer = { kind: "none" };
      await proposeSupplierItemQuantity(ports, input);

      expect(await proposeSupplierItemQuantity(ports, input)).toEqual({ kind: "none" });
      expect(quantityReader.asked).toHaveLength(1);
    });

    it("keeps that the quantity read does not fit the sale unit", async () => {
      const { quantityReader, ports } = setup();
      quantityReader.answer = { kind: "read", quantity: 2_500 };
      await proposeSupplierItemQuantity(ports, input);

      expect(await proposeSupplierItemQuantity(ports, input)).toEqual({ kind: "none" });
      expect(quantityReader.asked).toHaveLength(1);
    });

    it.each([
      ["unavailable", { kind: "unavailable" as const }],
      ["failing", new Error("network down")],
    ])(
      "keeps nothing when the reader is %s, so the next request asks again",
      async (_n, answer) => {
        const { quantityReader, store, ports } = setup();
        quantityReader.answer = answer;
        await proposeSupplierItemQuantity(ports, input);
        quantityReader.answer = { kind: "read", quantity: 1_000 };

        expect(await proposeSupplierItemQuantity(ports, input)).toEqual({
          kind: "proposed",
          quantity: 1_000,
        });
        expect(quantityReader.asked).toHaveLength(2);
        expect(store.quantityWrites).toBe(1);
      },
    );

    it("keeps a quantity per sale unit and net content", async () => {
      const { quantityReader, ports } = setup();
      quantityReader.answer = { kind: "read", quantity: 36_000 };
      await proposeSupplierItemQuantity(ports, input);
      quantityReader.answer = { kind: "read", quantity: 12_000 };

      expect(
        await proposeSupplierItemQuantity(ports, {
          ...input,
          netContent: { quantity: 500, unit: "ML" },
        }),
      ).toEqual({ kind: "proposed", quantity: 12_000 });
      expect(
        await proposeSupplierItemQuantity(ports, {
          ...input,
          netContent: { quantity: 250, unit: "G" },
        }),
      ).toEqual({ kind: "proposed", quantity: 12_000 });
      expect(await proposeSupplierItemQuantity(ports, { ...input, saleUnit: "KG" })).toEqual({
        kind: "proposed",
        quantity: 12_000,
      });
      expect(await proposeSupplierItemQuantity(ports, input)).toEqual({
        kind: "proposed",
        quantity: 36_000,
      });
      expect(quantityReader.asked).toHaveLength(4);
    });

    it("keeps a quantity for a product with no net content apart from one with a net content", async () => {
      const { quantityReader, ports } = setup();
      quantityReader.answer = { kind: "read", quantity: 36_000 };
      await proposeSupplierItemQuantity(ports, { ...input, netContent: null });
      quantityReader.answer = { kind: "read", quantity: 12_000 };

      expect(await proposeSupplierItemQuantity(ports, input)).toEqual({
        kind: "proposed",
        quantity: 12_000,
      });
      expect(await proposeSupplierItemQuantity(ports, { ...input, netContent: null })).toEqual({
        kind: "proposed",
        quantity: 36_000,
      });
      expect(quantityReader.asked).toHaveLength(2);
    });

    it("keeps a quantity per row", async () => {
      const { quantityReader, ports } = setup();
      quantityReader.answer = { kind: "read", quantity: 36_000 };
      await proposeSupplierItemQuantity(ports, input);
      quantityReader.answer = { kind: "read", quantity: 12_000 };

      expect(await proposeSupplierItemQuantity(ports, { ...input, rowId: "row-2" })).toEqual({
        kind: "proposed",
        quantity: 12_000,
      });
    });

    it("asks again on refresh, records the call and replaces the kept quantity", async () => {
      const { quantityReader, aiCalls, ports } = setup();
      quantityReader.answer = { kind: "read", quantity: 36_000 };
      await proposeSupplierItemQuantity(ports, input);
      quantityReader.answer = { kind: "read", quantity: 12_000 };
      quantityReader.reportedCalls = [usage("completed")];

      expect(await proposeSupplierItemQuantity(ports, refresh)).toEqual({
        kind: "proposed",
        quantity: 12_000,
      });
      expect(aiCalls.recorded).toHaveLength(1);
      expect(await proposeSupplierItemQuantity(ports, input)).toEqual({
        kind: "proposed",
        quantity: 12_000,
      });
      expect(quantityReader.asked).toHaveLength(2);
    });

    it("leaves the kept quantity untouched when a refresh is unavailable", async () => {
      const { quantityReader, ports } = setup();
      quantityReader.answer = { kind: "read", quantity: 36_000 };
      await proposeSupplierItemQuantity(ports, input);
      quantityReader.answer = { kind: "unavailable" };

      expect(await proposeSupplierItemQuantity(ports, refresh)).toEqual({ kind: "unavailable" });
      expect(await proposeSupplierItemQuantity(ports, input)).toEqual({
        kind: "proposed",
        quantity: 36_000,
      });
    });

    it("keeps nothing and records nothing for a row that does not exist", async () => {
      const { store, aiCalls, ports } = setup();

      await proposeSupplierItemQuantity(ports, { ...input, rowId: "missing" });

      expect(store.quantityWrites).toBe(0);
      expect(aiCalls.recordings).toBe(0);
    });

    it("keeps nothing when the calls cannot be recorded", async () => {
      const { quantityReader, aiCalls, store, ports } = setup();
      quantityReader.reportedCalls = [usage("completed")];
      aiCalls.failure = new Error("storage down");

      await expect(proposeSupplierItemQuantity(ports, input)).rejects.toThrow("storage down");
      expect(store.quantityWrites).toBe(0);
    });
  });
});
