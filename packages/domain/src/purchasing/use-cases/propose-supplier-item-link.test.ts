import { describe, expect, it } from "vitest";
import { proposeSupplierItemLink } from "./propose-supplier-item-link.js";
import { FakeProductChooser } from "./test-support/fake-product-chooser.js";
import {
  type FakeProposalData,
  FakeSupplierItemLinkProposalReader,
} from "./test-support/fake-supplier-item-link-proposal-reader.js";

const YERBA = { id: "product-1", name: "Yerba Piragüé 1 kg", barcodes: ["7790001000012"] };
const AZUCAR = { id: "product-2", name: "Azúcar Cañaral 1 kg" };

function setup(
  row: { description?: string; presentation?: string | null; barcode?: string | null } = {},
  products: NonNullable<FakeProposalData["products"]> = [YERBA, AZUCAR],
) {
  const reader = new FakeSupplierItemLinkProposalReader({
    rows: [
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
  return { reader, chooser, ports: { reader, chooser } };
}

const input = { listId: "list-1", rowId: "row-1" };

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
    it("proposes the only active product carrying the barcode, without asking the model", async () => {
      const { chooser, reader, ports } = setup({ barcode: "7790001000012" });

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "barcode",
        product: { id: "product-1", name: "Yerba Piragüé 1 kg", brandName: null, netContent: null },
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
      chooser.answer = { kind: "chosen", productId: "product-1" };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "ai",
        product: { id: "product-1", name: "Yerba Piragüé 1 kg", brandName: null, netContent: null },
      });
    });

    it("asks the model when several active products carry the barcode", async () => {
      const twin = { id: "product-3", name: "Yerba Piragüé 500 g", barcodes: ["7790001000012"] };
      const { chooser, ports } = setup({ barcode: "7790001000012" }, [YERBA, twin, AZUCAR]);
      chooser.answer = { kind: "chosen", productId: "product-3" };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "ai",
        product: {
          id: "product-3",
          name: "Yerba Piragüé 500 g",
          brandName: null,
          netContent: null,
        },
      });
    });
  });

  describe("by the model over text-search candidates", () => {
    it("gives the model the item's text and the candidates found by the words of its description", async () => {
      const { chooser, ports } = setup();
      chooser.answer = { kind: "chosen", productId: "product-1" };

      await proposeSupplierItemLink(ports, input);

      expect(chooser.asked).toEqual([
        {
          item: { description: "YERBA PIRAGUE 1KG", presentation: "Caja x 10" },
          candidates: [
            { id: "product-1", name: "Yerba Piragüé 1 kg", brandName: null, netContent: null },
          ],
        },
      ]);
    });

    it("proposes the product the model chose", async () => {
      const { chooser, ports } = setup({ description: "yerba azucar 1 kg" });
      chooser.answer = { kind: "chosen", productId: "product-2" };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "ai",
        product: {
          id: "product-2",
          name: "Azúcar Cañaral 1 kg",
          brandName: null,
          netContent: null,
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
      chooser.answer = { kind: "chosen", productId: "product-2" };

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
        },
      ]);
    });

    describe("telling same-name products apart", () => {
      const GRANOLA_KOS = {
        id: "p-kos",
        name: "Granola Berries",
        brandName: "Kos",
        netContent: { quantity: 1, unit: "KG" },
      } as const;
      const GRANOLA_OTHER = {
        id: "p-other",
        name: "Granola Berries",
        brandName: "Otra",
        netContent: { quantity: 500, unit: "G" },
      } as const;
      const item = { description: "Granola berries 1kg - Kos", presentation: null };

      it("proposes the product of the item's brand and size among same-name products", async () => {
        const { chooser, ports } = setup(item, [GRANOLA_OTHER, GRANOLA_KOS]);
        chooser.answer = { kind: "chosen", productId: "p-kos" };

        expect(await proposeSupplierItemLink(ports, input)).toEqual({
          kind: "proposed",
          by: "ai",
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
});
