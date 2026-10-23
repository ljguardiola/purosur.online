import { describe, expect, it } from "vitest";
import { findSupplierPriceListFile } from "./find-supplier-price-list-file.js";
import { FakeSupplierPriceListFiles } from "./test-support/fake-supplier-price-list-files.js";
import { FakeSupplierPriceListReader } from "./test-support/fake-supplier-price-list-reader.js";

const PDF = new Uint8Array([37, 80, 68, 70]);

function setup() {
  const reader = new FakeSupplierPriceListReader({
    lists: [
      {
        id: "list-1",
        supplier: { id: "supplier-a", name: "Distribuidora Sur" },
        source: { kind: "PDF", fileName: "lista-marzo.pdf" },
        listDate: null,
        rowCount: 0,
        unpricedRowCount: 0,
        state: "READING",
        readFailure: null,
        uploadedAt: new Date("2026-03-01T12:00:00Z"),
        confirmedAt: null,
      },
    ],
  });
  const files = new FakeSupplierPriceListFiles();
  return { files, ports: { reader, files } };
}

describe("findSupplierPriceListFile", () => {
  it("answers the file with the name it was uploaded under", async () => {
    const { files, ports } = setup();
    files.stored.set("list-1", PDF);

    expect(await findSupplierPriceListFile(ports, "list-1")).toEqual({
      kind: "found",
      fileName: "lista-marzo.pdf",
      bytes: PDF,
    });
    expect(files.reads).toEqual([{ listId: "list-1", contentKind: "PDF" }]);
  });

  it("answers not_found for a list read from a web page, which has no uploaded file", async () => {
    const reader = new FakeSupplierPriceListReader({
      lists: [
        {
          id: "web-list",
          supplier: { id: "supplier-a", name: "Distribuidora Sur" },
          source: { kind: "WEB_PAGE", url: "https://distribuidora-sur.example/lista" },
          listDate: null,
          rowCount: 0,
          unpricedRowCount: 0,
          state: "READING",
          readFailure: null,
          uploadedAt: new Date("2026-03-01T12:00:00Z"),
          confirmedAt: null,
        },
      ],
    });
    const { files } = setup();
    files.stored.set("web-list", PDF);

    expect(await findSupplierPriceListFile({ reader, files }, "web-list")).toEqual({
      kind: "not_found",
    });
  });

  it("answers not_found for a missing list", async () => {
    const { files, ports } = setup();
    files.stored.set("missing", PDF);

    expect(await findSupplierPriceListFile(ports, "missing")).toEqual({ kind: "not_found" });
  });

  it("answers not_found for a list whose file is not kept", async () => {
    const { ports } = setup();

    expect(await findSupplierPriceListFile(ports, "list-1")).toEqual({ kind: "not_found" });
  });
});
