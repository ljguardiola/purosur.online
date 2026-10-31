import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import type { AiCallUsage } from "./ai-call-usage.js";
import { proposeSupplierItemLink } from "./propose-supplier-item-link.js";
import { FakeProductChooser } from "./test-support/fake-product-chooser.js";
import {
  type FakeProposalData,
  FakeSupplierItemLinkProposalReader,
} from "./test-support/fake-supplier-item-link-proposal-reader.js";
import { FakeSupplierItemQuantityReader } from "./test-support/fake-supplier-item-quantity-reader.js";
import { FakeSupplierPriceListAiCallStore } from "./test-support/fake-supplier-price-list-ai-call-store.js";

const YERBA = { id: "product-1", name: "Yerba Piragüé 1 kg", barcodes: ["7790001000012"] };
const AZUCAR = { id: "product-2", name: "Azúcar Cañaral 1 kg" };

function setup(
  row: { description?: string; presentation?: string | null; barcode?: string | null } = {},
  products: NonNullable<FakeProposalData["products"]> = [YERBA, AZUCAR],
  siblingPresentations: string[] = [],
) {
  const reader = new FakeSupplierItemLinkProposalReader({
    rows: [
      ...siblingPresentations.map((presentation, index) => ({
        listId: "list-1",
        id: `sibling-${index}`,
        description: row.description ?? "YERBA PIRAGUE 1KG",
        presentation,
        barcode: null,
      })),
      {
        listId: "list-1",
        id: "row-1",
        description: "YERBA PIRAGUE 1KG",
        presentation: "Caja x 10",
        barcode: null,
        ...row,
      },
    ],
    products,
  });
  const chooser = new FakeProductChooser();
  const quantityReader = new FakeSupplierItemQuantityReader();
  const aiCalls = new FakeSupplierPriceListAiCallStore();
  return {
    reader,
    chooser,
    quantityReader,
    aiCalls,
    ports: { reader, chooser, quantityReader, aiCalls, zoneRules: new FakeZoneRulesSource() },
  };
}

const NOW = new Date("2026-03-11T01:30:00Z");
const input = { listId: "list-1", rowId: "row-1", actorId: "person-1", now: () => NOW };

describe("proposeSupplierItemLink", () => {
  it("answers not_found for a row that does not exist", async () => {
    const { chooser, ports } = setup();

    expect(await proposeSupplierItemLink(ports, { ...input, rowId: "missing" })).toEqual({
      kind: "not_found",
    });
    expect(chooser.asked).toEqual([]);
  });

  it("answers not_found for a row of another list", async () => {
    const { ports } = setup();

    expect(await proposeSupplierItemLink(ports, { ...input, listId: "other" })).toEqual({
      kind: "not_found",
    });
  });

  describe("by barcode", () => {
    it("proposes the only active product carrying the barcode, without asking the model to choose", async () => {
      const { chooser, reader, ports } = setup({ barcode: "7790001000012" });

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "barcode",
        quantity: null,
        product: {
          id: "product-1",
          name: "Yerba Piragüé 1 kg",
          brandName: null,
          netContent: null,
          saleUnit: "UNIT",
        },
      });
      expect(reader.barcodeLookups).toEqual(["7790001000012"]);
      expect(chooser.asked).toEqual([]);
    });

    it("looks for no barcode when the row has none", async () => {
      const { reader, ports } = setup({ barcode: null });

      await proposeSupplierItemLink(ports, input);

      expect(reader.barcodeLookups).toEqual([]);
    });

    it("asks the model when no active product carries the barcode", async () => {
      const { chooser, ports } = setup({ barcode: "7790009999999" });
      chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "ai",
        quantity: null,
        product: {
          id: "product-1",
          name: "Yerba Piragüé 1 kg",
          brandName: null,
          netContent: null,
          saleUnit: "UNIT",
        },
      });
    });

    it("asks the model when several active products carry the barcode", async () => {
      const twin = { id: "product-3", name: "Yerba Piragüé 500 g", barcodes: ["7790001000012"] };
      const { chooser, ports } = setup({ barcode: "7790001000012" }, [YERBA, twin, AZUCAR]);
      chooser.answer = { kind: "chosen", productId: "product-3", quantity: null };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "ai",
        quantity: null,
        product: {
          id: "product-3",
          name: "Yerba Piragüé 500 g",
          brandName: null,
          netContent: null,
          saleUnit: "UNIT",
        },
      });
    });
  });

  describe("by the model over text-search candidates", () => {
    it("gives the model the item's text and the candidates found by the words of its description", async () => {
      const { chooser, ports } = setup();
      chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };

      await proposeSupplierItemLink(ports, input);

      expect(chooser.asked).toEqual([
        {
          item: {
            description: "YERBA PIRAGUE 1KG",
            presentation: "Caja x 10",
            otherPresentations: [],
          },
          candidates: [
            {
              id: "product-1",
              name: "Yerba Piragüé 1 kg",
              brandName: null,
              netContent: null,
              saleUnit: "UNIT",
            },
          ],
        },
      ]);
    });

    it("proposes the product the model chose", async () => {
      const { chooser, ports } = setup({ description: "yerba azucar 1 kg" });
      chooser.answer = { kind: "chosen", productId: "product-2", quantity: null };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "ai",
        quantity: null,
        product: {
          id: "product-2",
          name: "Azúcar Cañaral 1 kg",
          brandName: null,
          netContent: null,
          saleUnit: "UNIT",
        },
      });
    });

    it("proposes nothing, without asking the model, when no product shares a word with the text", async () => {
      const { chooser, ports } = setup({ description: "Detergente" });

      expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "none" });
      expect(chooser.asked).toEqual([]);
    });

    it("proposes nothing when the model finds none of the candidates fit", async () => {
      const { chooser, ports } = setup();
      chooser.answer = { kind: "none" };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "none" });
    });

    it("proposes nothing when the model names a product that was not a candidate", async () => {
      const { chooser, ports } = setup();
      chooser.answer = { kind: "chosen", productId: "product-2", quantity: null };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "none" });
    });

    it("answers unavailable when the model is unavailable", async () => {
      const { chooser, ports } = setup();
      chooser.answer = { kind: "unavailable" };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "unavailable" });
    });

    it("answers unavailable when the model fails", async () => {
      const { chooser, ports } = setup();
      chooser.answer = new Error("network down");

      expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "unavailable" });
    });

    it("gives the model each candidate's name, brand and net content", async () => {
      const { chooser, ports } = setup({ description: "Granola" }, [
        {
          id: "p-kos",
          name: "Granola Berries",
          brandName: "Kos",
          netContent: { quantity: 1, unit: "KG" },
        },
      ]);

      await proposeSupplierItemLink(ports, input);

      expect(chooser.asked[0]?.candidates).toEqual([
        {
          id: "p-kos",
          name: "Granola Berries",
          brandName: "Kos",
          netContent: { quantity: 1, unit: "KG" },
          saleUnit: "UNIT",
        },
      ]);
    });

    describe("telling same-name products apart", () => {
      const GRANOLA_KOS = {
        id: "p-kos",
        name: "Granola Berries",
        brandName: "Kos",
        netContent: { quantity: 1, unit: "KG" },
        saleUnit: "UNIT",
      } as const;
      const GRANOLA_OTHER = {
        id: "p-other",
        name: "Granola Berries",
        brandName: "Otra",
        netContent: { quantity: 500, unit: "G" },
        saleUnit: "UNIT",
      } as const;
      const item = { description: "Granola berries 1kg - Kos", presentation: null };

      it("proposes the product of the item's brand and size among same-name products", async () => {
        const { chooser, ports } = setup(item, [GRANOLA_OTHER, GRANOLA_KOS]);
        chooser.answer = { kind: "chosen", productId: "p-kos", quantity: null };

        expect(await proposeSupplierItemLink(ports, input)).toEqual({
          kind: "proposed",
          by: "ai",
          quantity: null,
          product: GRANOLA_KOS,
        });
        expect(chooser.asked[0]?.candidates.map(({ id }) => id)).toEqual(["p-kos", "p-other"]);
      });

      it("proposes nothing when only other brands carry the name and the model is not certain", async () => {
        const { chooser, ports } = setup(item, [GRANOLA_OTHER]);

        expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "none" });
        expect(chooser.asked).toHaveLength(1);
      });
    });

    it("finds a candidate by a size written only in the presentation", async () => {
      const { chooser, ports } = setup({ description: "Aceite", presentation: "Botella 1 L" }, [
        { id: "p-oil", name: "Girasol", netContent: { quantity: 1, unit: "L" } },
      ]);

      await proposeSupplierItemLink(ports, input);

      expect(chooser.asked[0]?.candidates.map(({ id }) => id)).toEqual(["p-oil"]);
    });

    it("does not read a null presentation as text", async () => {
      const { chooser, ports } = setup({ description: "Aceite", presentation: null }, [
        { id: "p-null", name: "Null" },
      ]);

      expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "none" });
      expect(chooser.asked).toEqual([]);
    });

    it("passes at most the best twenty candidates", async () => {
      const products = Array.from({ length: 25 }, (_, index) => ({
        id: `product-${index}`,
        name: `Yerba ${index}`,
      }));
      const { chooser, ports } = setup({ description: "yerba" }, products);

      await proposeSupplierItemLink(ports, input);

      expect(chooser.asked[0]?.candidates).toHaveLength(20);
    });
  });

  describe("recording of the AI calls", () => {
    const usage = (
      outcome: AiCallUsage["outcome"],
      overrides: Partial<AiCallUsage["attempts"][number]> = {},
    ): AiCallUsage => ({
      outcome,
      attempts: [
        {
          model: "claude-sonnet-5-5",
          inputTokens: 2_000,
          outputTokens: 100,
          cacheWriteTokens: 10,
          cacheReadTokens: 1_000,
          ...overrides,
        },
      ],
    });

    it("records each attempt the chooser reports for the row, the person and the moment", async () => {
      const { chooser, aiCalls, ports } = setup();
      chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };
      chooser.reportedCalls = [usage("completed")];

      await proposeSupplierItemLink(ports, input);

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

    it.each([
      ["unavailable", { kind: "unavailable" as const }],
      ["none", { kind: "none" as const }],
    ])("records the calls of a choice that is %s", async (_name, answer) => {
      const { chooser, aiCalls, ports } = setup();
      chooser.answer = answer;
      chooser.reportedCalls = [usage("failed")];

      await proposeSupplierItemLink(ports, input);

      expect(aiCalls.recorded).toEqual([expect.objectContaining({ outcome: "failed" })]);
    });

    it("records the calls reported before the chooser throws, answering unavailable", async () => {
      const { chooser, aiCalls, ports } = setup();
      chooser.answer = new Error("connection reset");
      chooser.reportedCalls = [usage("cut_short")];

      expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "unavailable" });

      expect(aiCalls.recorded).toEqual([expect.objectContaining({ outcome: "cut_short" })]);
    });

    it("records nothing when the chooser reports no attempt", async () => {
      const { chooser, aiCalls, ports } = setup();
      chooser.reportedCalls = [{ outcome: "failed", attempts: [] }];

      await proposeSupplierItemLink(ports, input);

      expect(aiCalls.recordings).toBe(0);
    });

    it("records the calls of the quantity reading of a proposal by barcode", async () => {
      const { chooser, quantityReader, aiCalls, ports } = setup({ barcode: "7790001000012" });
      chooser.reportedCalls = [usage("completed")];
      quantityReader.reportedCalls = [usage("cut_short")];

      await proposeSupplierItemLink(ports, input);

      expect(aiCalls.recorded).toEqual([
        expect.objectContaining({
          purpose: "LINK_PROPOSAL",
          listId: "list-1",
          rowId: "row-1",
          actorId: "person-1",
          outcome: "cut_short",
        }),
      ]);
    });

    it("records the calls the quantity reader reports before it throws", async () => {
      const { quantityReader, aiCalls, ports } = setup({ barcode: "7790001000012" });
      quantityReader.answer = new Error("connection reset");
      quantityReader.reportedCalls = [usage("failed")];

      await proposeSupplierItemLink(ports, input);

      expect(aiCalls.recorded).toEqual([expect.objectContaining({ outcome: "failed" })]);
    });

    it("records nothing when the quantity reader reports no attempt", async () => {
      const { quantityReader, aiCalls, ports } = setup({ barcode: "7790001000012" });
      quantityReader.reportedCalls = [{ outcome: "failed", attempts: [] }];

      await proposeSupplierItemLink(ports, input);

      expect(aiCalls.recordings).toBe(0);
    });

    it("records nothing when no candidate exists", async () => {
      const { chooser, aiCalls, ports } = setup({ description: "Detergente" });
      chooser.reportedCalls = [usage("completed")];

      await proposeSupplierItemLink(ports, input);

      expect(aiCalls.recordings).toBe(0);
    });

    it("records nothing for a row that does not exist", async () => {
      const { aiCalls, ports } = setup();

      await proposeSupplierItemLink(ports, { ...input, rowId: "missing" });

      expect(aiCalls.recordings).toBe(0);
    });

    it("does not answer when the calls cannot be recorded", async () => {
      const { chooser, aiCalls, ports } = setup();
      chooser.reportedCalls = [usage("completed")];
      aiCalls.failure = new Error("storage down");

      await expect(proposeSupplierItemLink(ports, input)).rejects.toThrow("storage down");
    });
  });

  describe("the quantity", () => {
    const OTHER_PRESENTATIONS_ITEM = {
      description: "Aceite de palta 250 ml",
      presentation: "x3 packs",
    };
    const ACEITE = { id: "p-aceite", name: "Aceite de palta 250 ml" };

    it("proposes the quantity the model read together with the chosen product", async () => {
      const { chooser, quantityReader, ports } = setup(OTHER_PRESENTATIONS_ITEM, [ACEITE]);
      chooser.answer = { kind: "chosen", productId: "p-aceite", quantity: 36_000 };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "ai",
        quantity: 36_000,
        product: { ...ACEITE, brandName: null, netContent: null, saleUnit: "UNIT" },
      });
      expect(quantityReader.asked).toEqual([]);
    });

    it("gives the model the other presentations the list states for the same description", async () => {
      const { chooser, ports } = setup(
        OTHER_PRESENTATIONS_ITEM,
        [ACEITE],
        ["Pack x12u", "Pack x12u", "Caja"],
      );

      await proposeSupplierItemLink(ports, input);

      expect(chooser.asked[0]?.item).toEqual({
        ...OTHER_PRESENTATIONS_ITEM,
        otherPresentations: ["Pack x12u", "Caja"],
      });
    });

    it("gives the model the sale unit of each candidate", async () => {
      const { chooser, ports } = setup({ description: "Almendras" }, [
        { id: "p-almendras", name: "Almendras peladas", saleUnit: "KG" },
      ]);

      await proposeSupplierItemLink(ports, input);

      expect(chooser.asked[0]?.candidates).toEqual([expect.objectContaining({ saleUnit: "KG" })]);
    });

    it("proposes the product with no quantity when the model could not tell it", async () => {
      const { chooser, ports } = setup(OTHER_PRESENTATIONS_ITEM, [ACEITE]);
      chooser.answer = { kind: "chosen", productId: "p-aceite", quantity: null };

      expect(await proposeSupplierItemLink(ports, input)).toEqual(
        expect.objectContaining({ kind: "proposed", quantity: null }),
      );
    });

    it("proposes the product with no quantity when the model answers one its sale unit cannot hold", async () => {
      const { chooser, ports } = setup({ description: "Almendras" }, [
        { id: "p-almendras", name: "Almendras peladas", saleUnit: "UNIT" },
      ]);
      chooser.answer = { kind: "chosen", productId: "p-almendras", quantity: 2_500 };

      expect(await proposeSupplierItemLink(ports, input)).toEqual(
        expect.objectContaining({ kind: "proposed", quantity: null }),
      );
    });

    it("proposes the quantity in grams of a product sold by weight", async () => {
      const { chooser, ports } = setup({ description: "Almendras" }, [
        { id: "p-almendras", name: "Almendras peladas", saleUnit: "KG" },
      ]);
      chooser.answer = { kind: "chosen", productId: "p-almendras", quantity: 5_000 };

      expect(await proposeSupplierItemLink(ports, input)).toEqual(
        expect.objectContaining({ kind: "proposed", quantity: 5_000 }),
      );
    });

    describe("of a product proposed by barcode", () => {
      const withBarcode = { ...OTHER_PRESENTATIONS_ITEM, barcode: "7790001000012" };
      const PRODUCT = {
        ...ACEITE,
        barcodes: ["7790001000012"],
        netContent: { quantity: 250, unit: "ML" as const },
      };

      it("is read by the quantity reader from the item and the product", async () => {
        const { quantityReader, ports } = setup(withBarcode, [PRODUCT], ["Pack x12u"]);
        quantityReader.answer = { kind: "read", quantity: 36_000 };

        expect(await proposeSupplierItemLink(ports, input)).toEqual({
          kind: "proposed",
          by: "barcode",
          quantity: 36_000,
          product: {
            id: "p-aceite",
            name: ACEITE.name,
            brandName: null,
            netContent: PRODUCT.netContent,
            saleUnit: "UNIT",
          },
        });
        expect(quantityReader.asked).toEqual([
          {
            item: { ...OTHER_PRESENTATIONS_ITEM, otherPresentations: ["Pack x12u"] },
            product: { saleUnit: "UNIT", netContent: PRODUCT.netContent },
          },
        ]);
      });

      it.each([
        ["none", { kind: "none" as const }],
        ["unavailable", { kind: "unavailable" as const }],
        ["an invalid quantity", { kind: "read" as const, quantity: 1_500 }],
        ["a failure", new Error("network down")],
      ])("leaves the quantity empty when the reader answers %s", async (_name, answer) => {
        const { quantityReader, ports } = setup(withBarcode, [PRODUCT]);
        quantityReader.answer = answer;

        expect(await proposeSupplierItemLink(ports, input)).toEqual(
          expect.objectContaining({ kind: "proposed", by: "barcode", quantity: null }),
        );
      });
    });
  });
});
