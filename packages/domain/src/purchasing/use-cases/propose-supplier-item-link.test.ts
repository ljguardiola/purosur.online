import { describe, expect, it } from "vitest";
import { proposeSupplierItemLink } from "./propose-supplier-item-link.js";
import { FakeProductChooser } from "./test-support/fake-product-chooser.js";
import { FakeSupplierItemLinkProposalReader } from "./test-support/fake-supplier-item-link-proposal-reader.js";

const YERBA = { id: "product-1", name: "Yerba Taragüi 1 kg", barcodes: ["7790001000012"] };
const AZUCAR = { id: "product-2", name: "Azúcar Ledesma 1 kg" };

function setup(
  row: { description?: string; presentation?: string | null; barcode?: string | null } = {},
  products = [YERBA, AZUCAR],
) {
  const reader = new FakeSupplierItemLinkProposalReader({
    rows: [
      {
        listId: "list-1",
        id: "row-1",
        description: "YERBA TARAGUI 1KG",
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
        product: { id: "product-1", name: "Yerba Taragüi 1 kg" },
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
        product: { id: "product-1", name: "Yerba Taragüi 1 kg" },
      });
    });

    it("asks the model when several active products carry the barcode", async () => {
      const twin = { id: "product-3", name: "Yerba Taragüi 500 g", barcodes: ["7790001000012"] };
      const { chooser, ports } = setup({ barcode: "7790001000012" }, [YERBA, twin, AZUCAR]);
      chooser.answer = { kind: "chosen", productId: "product-3" };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "ai",
        product: { id: "product-3", name: "Yerba Taragüi 500 g" },
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
          item: { description: "YERBA TARAGUI 1KG", presentation: "Caja x 10" },
          candidates: [{ id: "product-1", name: "Yerba Taragüi 1 kg" }],
        },
      ]);
    });

    it("proposes the product the model chose", async () => {
      const { chooser, ports } = setup({ description: "yerba azucar 1 kg" });
      chooser.answer = { kind: "chosen", productId: "product-2" };

      expect(await proposeSupplierItemLink(ports, input)).toEqual({
        kind: "proposed",
        by: "ai",
        product: { id: "product-2", name: "Azúcar Ledesma 1 kg" },
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
