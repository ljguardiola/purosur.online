import { describe, expect, it } from "vitest";
import { FakeZoneRulesSource } from "../../shared/test-support/fake-zone-rules-source.js";
import { PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO } from "../model/supplier-item.js";
import type { AiCallUsage } from "./ai-call-usage.js";
import { proposeSupplierItemLink } from "./propose-supplier-item-link.js";
import { FakeProductChooser } from "./test-support/fake-product-chooser.js";
import {
  type FakeProposalData,
  FakeSupplierItemLinkProposalReader,
} from "./test-support/fake-supplier-item-link-proposal-reader.js";
import { FakeSupplierItemProposalStore } from "./test-support/fake-supplier-item-proposal-store.js";
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
  const store = new FakeSupplierItemProposalStore();
  return {
    reader,
    chooser,
    quantityReader,
    aiCalls,
    store,
    ports: {
      reader,
      chooser,
      quantityReader,
      aiCalls,
      store,
      zoneRules: new FakeZoneRulesSource(),
    },
  };
}

const NOW = new Date("2026-03-11T01:30:00Z");
const input = {
  listId: "list-1",
  rowId: "row-1",
  actorId: "person-1",
  now: () => NOW,
  refresh: false,
};

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

    it("proposes by barcode only among the products a supplier item may be linked to", async () => {
      const inactiveTwin = {
        id: "product-3",
        name: "Yerba Piragüé 500 g",
        barcodes: ["7790001000012"],
        active: false,
      };
      const { chooser, reader, ports } = setup({ barcode: "7790001000012" }, [
        YERBA,
        inactiveTwin,
        AZUCAR,
      ]);

      expect(await proposeSupplierItemLink(ports, input)).toMatchObject({
        kind: "proposed",
        by: "barcode",
        product: { id: "product-1" },
      });
      expect(reader.scopesAsked).toEqual([PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO]);
      expect(chooser.asked).toEqual([]);
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

    it("gives the model only the products a supplier item may be linked to", async () => {
      const inactiveYerba = { id: "product-3", name: "Yerba Piragüé 500 g", active: false };
      const { chooser, reader, ports } = setup({}, [YERBA, inactiveYerba, AZUCAR]);
      chooser.answer = { kind: "none" };

      await proposeSupplierItemLink(ports, input);

      expect(chooser.asked.map(({ candidates }) => candidates.map(({ id }) => id))).toEqual([
        ["product-1"],
      ]);
      expect(reader.scopesAsked).toEqual([PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO]);
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

  describe("keeping the proposal", () => {
    const PROPOSED_YERBA = {
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
    } as const;
    const refresh = { ...input, refresh: true };

    describe("asking", () => {
      it("keeps the product the model chose with the quantity it read", async () => {
        const { chooser, store, ports } = setup();
        chooser.answer = { kind: "chosen", productId: "product-1", quantity: 36_000 };

        await proposeSupplierItemLink(ports, input);

        expect(store.links.get("row-1")).toEqual({
          kind: "proposed",
          by: "ai",
          productId: "product-1",
          quantity: 36_000,
        });
      });

      it("keeps that the model found no product fit", async () => {
        const { chooser, store, ports } = setup();
        chooser.answer = { kind: "none" };

        await proposeSupplierItemLink(ports, input);

        expect(store.links.get("row-1")).toEqual({ kind: "none" });
      });

      it("keeps the product proposed by barcode with the quantity read", async () => {
        const { quantityReader, store, ports } = setup({ barcode: "7790001000012" });
        quantityReader.answer = { kind: "read", quantity: 12_000 };

        await proposeSupplierItemLink(ports, input);

        expect(store.links.get("row-1")).toEqual({
          kind: "proposed",
          by: "barcode",
          productId: "product-1",
          quantity: 12_000,
        });
      });

      it("keeps the product proposed by barcode when the reading found no quantity", async () => {
        const { quantityReader, store, ports } = setup({ barcode: "7790001000012" });
        quantityReader.answer = { kind: "none" };

        await proposeSupplierItemLink(ports, input);

        expect(store.links.get("row-1")).toEqual({
          kind: "proposed",
          by: "barcode",
          productId: "product-1",
          quantity: null,
        });
      });

      it.each([
        ["unavailable", { kind: "unavailable" as const }],
        ["failing", new Error("network down")],
      ])("keeps nothing when the model is %s", async (_name, answer) => {
        const { chooser, store, ports } = setup();
        chooser.answer = answer;

        await proposeSupplierItemLink(ports, input);

        expect(store.linkWrites).toBe(0);
      });

      it.each([
        ["unavailable", { kind: "unavailable" as const }],
        ["failing", new Error("network down")],
      ])(
        "keeps nothing of a barcode proposal whose quantity reading is %s, and still proposes the product",
        async (_name, answer) => {
          const { quantityReader, store, ports } = setup({ barcode: "7790001000012" });
          quantityReader.answer = answer;

          expect(await proposeSupplierItemLink(ports, input)).toMatchObject({
            kind: "proposed",
            by: "barcode",
            quantity: null,
          });
          expect(store.linkWrites).toBe(0);
        },
      );

      it("keeps nothing when no candidate exists and no call is made", async () => {
        const { store, ports } = setup({ description: "Detergente" });

        await proposeSupplierItemLink(ports, input);

        expect(store.linkWrites).toBe(0);
      });

      it("keeps nothing when the model names a product that was not a candidate", async () => {
        const { chooser, store, ports } = setup();
        chooser.answer = { kind: "chosen", productId: "product-2", quantity: null };

        await proposeSupplierItemLink(ports, input);

        expect(store.linkWrites).toBe(0);
      });

      it("keeps nothing for a row that does not exist", async () => {
        const { store, ports } = setup();

        await proposeSupplierItemLink(ports, { ...input, rowId: "missing" });

        expect(store.linkWrites).toBe(0);
      });

      it("keeps nothing when the calls cannot be recorded", async () => {
        const { chooser, aiCalls, store, ports } = setup();
        chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };
        chooser.reportedCalls = [
          {
            outcome: "completed",
            attempts: [
              {
                model: "claude-sonnet-5-5",
                inputTokens: 1,
                outputTokens: 1,
                cacheWriteTokens: 0,
                cacheReadTokens: 0,
              },
            ],
          },
        ];
        aiCalls.failure = new Error("storage down");

        await expect(proposeSupplierItemLink(ports, input)).rejects.toThrow("storage down");
        expect(store.linkWrites).toBe(0);
      });

      it("asks again the next time after an unavailable answer", async () => {
        const { chooser, ports } = setup();
        chooser.answer = { kind: "unavailable" };
        await proposeSupplierItemLink(ports, input);
        chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };

        expect(await proposeSupplierItemLink(ports, input)).toEqual(PROPOSED_YERBA);
        expect(chooser.asked).toHaveLength(2);
      });
    });

    describe("showing a kept proposal", () => {
      const usage: AiCallUsage = {
        outcome: "completed",
        attempts: [
          {
            model: "claude-sonnet-5-5",
            inputTokens: 2_000,
            outputTokens: 100,
            cacheWriteTokens: 10,
            cacheReadTokens: 1_000,
          },
        ],
      };

      it("shows the kept proposal on a second opening without asking or recording", async () => {
        const { chooser, quantityReader, aiCalls, ports } = setup();
        chooser.answer = { kind: "chosen", productId: "product-1", quantity: 36_000 };
        chooser.reportedCalls = [usage];
        const first = await proposeSupplierItemLink(ports, input);

        expect(await proposeSupplierItemLink(ports, input)).toEqual(first);
        expect(chooser.asked).toHaveLength(1);
        expect(quantityReader.asked).toEqual([]);
        expect(aiCalls.recorded).toHaveLength(1);
      });

      it("shows a kept barcode proposal without reading the quantity again", async () => {
        const { quantityReader, aiCalls, ports } = setup({ barcode: "7790001000012" });
        quantityReader.answer = { kind: "read", quantity: 12_000 };
        quantityReader.reportedCalls = [usage];
        const first = await proposeSupplierItemLink(ports, input);

        expect(await proposeSupplierItemLink(ports, input)).toEqual(first);
        expect(quantityReader.asked).toHaveLength(1);
        expect(aiCalls.recorded).toHaveLength(1);
      });

      it("shows no proposal for a kept answer that none fit, without asking", async () => {
        const { chooser, ports } = setup();
        chooser.answer = { kind: "none" };
        await proposeSupplierItemLink(ports, input);

        expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "none" });
        expect(chooser.asked).toHaveLength(1);
      });

      it("shows the product as it is now among the products a supplier item may be linked to", async () => {
        const { reader, store, ports } = setup();
        await store.keepLinkProposal("row-1", {
          kind: "proposed",
          by: "ai",
          productId: "product-2",
          quantity: 3_000,
        });

        expect(await proposeSupplierItemLink(ports, input)).toEqual({
          kind: "proposed",
          by: "ai",
          quantity: 3_000,
          product: {
            id: "product-2",
            name: "Azúcar Cañaral 1 kg",
            brandName: null,
            netContent: null,
            saleUnit: "UNIT",
          },
        });
        expect(reader.scopesAsked).toEqual([PRODUCTS_A_SUPPLIER_ITEM_MAY_BE_LINKED_TO]);
      });

      it("shows no proposal, without asking, when the kept product can no longer be linked", async () => {
        const retired = { id: "product-3", name: "Yerba retirada", active: false };
        const { chooser, quantityReader, aiCalls, store, ports } = setup({}, [YERBA, retired]);
        await store.keepLinkProposal("row-1", {
          kind: "proposed",
          by: "barcode",
          productId: "product-3",
          quantity: null,
        });

        expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "none" });
        expect(chooser.asked).toEqual([]);
        expect(quantityReader.asked).toEqual([]);
        expect(aiCalls.recordings).toBe(0);
      });

      it("shows no proposal, without asking, when the kept product no longer exists", async () => {
        const { chooser, store, ports } = setup();
        await store.keepLinkProposal("row-1", {
          kind: "proposed",
          by: "ai",
          productId: "gone",
          quantity: null,
        });

        expect(await proposeSupplierItemLink(ports, input)).toEqual({ kind: "none" });
        expect(chooser.asked).toEqual([]);
      });

      it("answers not_found for a missing row even when a proposal is kept under its id", async () => {
        const { store, ports } = setup();
        await store.keepLinkProposal("missing", { kind: "none" });

        expect(await proposeSupplierItemLink(ports, { ...input, rowId: "missing" })).toEqual({
          kind: "not_found",
        });
      });

      it("uses the proposal kept for its own row only", async () => {
        const { chooser, store, ports } = setup();
        await store.keepLinkProposal("row-2", { kind: "none" });
        chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };

        expect(await proposeSupplierItemLink(ports, input)).toEqual(PROPOSED_YERBA);
      });
    });

    describe("refreshing", () => {
      it("asks again, records the call and replaces the kept proposal", async () => {
        const { chooser, aiCalls, store, ports } = setup({ description: "yerba azucar 1 kg" });
        chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };
        await proposeSupplierItemLink(ports, input);
        chooser.answer = { kind: "chosen", productId: "product-2", quantity: 2_000 };
        chooser.reportedCalls = [
          {
            outcome: "completed",
            attempts: [
              {
                model: "claude-sonnet-5-5",
                inputTokens: 1,
                outputTokens: 1,
                cacheWriteTokens: 0,
                cacheReadTokens: 0,
              },
            ],
          },
        ];

        expect(await proposeSupplierItemLink(ports, refresh)).toMatchObject({
          kind: "proposed",
          product: { id: "product-2" },
          quantity: 2_000,
        });

        expect(chooser.asked).toHaveLength(2);
        expect(aiCalls.recorded).toHaveLength(1);
        expect(store.links.get("row-1")).toEqual({
          kind: "proposed",
          by: "ai",
          productId: "product-2",
          quantity: 2_000,
        });
        expect(await proposeSupplierItemLink(ports, input)).toMatchObject({
          product: { id: "product-2" },
        });
        expect(chooser.asked).toHaveLength(2);
      });

      it("asks when nothing is kept yet", async () => {
        const { chooser, ports } = setup();
        chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };

        expect(await proposeSupplierItemLink(ports, refresh)).toEqual(PROPOSED_YERBA);
        expect(chooser.asked).toHaveLength(1);
      });

      it("replaces a kept product with the model's answer that none fit", async () => {
        const { chooser, store, ports } = setup();
        chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };
        await proposeSupplierItemLink(ports, input);
        chooser.answer = { kind: "none" };

        expect(await proposeSupplierItemLink(ports, refresh)).toEqual({ kind: "none" });
        expect(store.links.get("row-1")).toEqual({ kind: "none" });
      });

      it("leaves the kept proposal untouched when the answer is unavailable", async () => {
        const { chooser, store, ports } = setup();
        chooser.answer = { kind: "chosen", productId: "product-1", quantity: null };
        await proposeSupplierItemLink(ports, input);
        chooser.answer = { kind: "unavailable" };

        expect(await proposeSupplierItemLink(ports, refresh)).toEqual({ kind: "unavailable" });
        expect(store.links.get("row-1")).toMatchObject({ productId: "product-1" });
        chooser.answer = { kind: "none" };
        expect(await proposeSupplierItemLink(ports, input)).toMatchObject({
          kind: "proposed",
          product: { id: "product-1" },
        });
      });

      it("leaves the kept proposal untouched when no candidate exists", async () => {
        const { store, ports } = setup({ description: "Detergente" });
        await store.keepLinkProposal("row-1", {
          kind: "proposed",
          by: "ai",
          productId: "product-1",
          quantity: null,
        });

        expect(await proposeSupplierItemLink(ports, refresh)).toEqual({ kind: "none" });
        expect(store.linkWrites).toBe(1);
      });
    });
  });
});
