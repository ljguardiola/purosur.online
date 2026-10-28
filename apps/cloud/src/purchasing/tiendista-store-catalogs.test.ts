import {
  PRICE_LIST_EXTRACTION_MAX_DESCRIPTION_LENGTH,
  PRICE_LIST_EXTRACTION_MAX_ROWS,
  PRICE_LIST_EXTRACTION_MAX_SHORT_TEXT_LENGTH,
  supplierItemKey,
} from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  FICTIONAL_TIENDISTA_STORE,
  fictionalTiendistaProductDataBytes,
} from "./test-support/fictional-tiendista-store.js";
import { TiendistaStoreCatalogs } from "./tiendista-store-catalogs.js";

const catalogs = new TiendistaStoreCatalogs();

const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

async function rowsOf(entries: unknown[]) {
  const reading = await catalogs.rows(bytesOf(entries));
  if (reading.kind !== "read") {
    throw new Error("test setup: expected the catalog to be read");
  }
  return reading.rows;
}

describe("TiendistaStoreCatalogs", () => {
  it(`reads every product and presentation of ${FICTIONAL_TIENDISTA_STORE}, sold out ones included, in order`, async () => {
    expect(await catalogs.rows(fictionalTiendistaProductDataBytes())).toEqual({
      kind: "read",
      rows: [
        row("Yerba mate suave Don Ernesto", "101", "Unidad", 320000),
        row("Yerba mate suave Don Ernesto", "102", "Pack x 6", 1800000),
        row("Yerba mate suave Don Ernesto", "103", "Pack x 12", 3450000),
        row("Fideos tirabuzon La Pampita", "104", "Unidad", 125050),
        row("Aceite de girasol Campo Verde", "105", "Botella 900 ml", 289050),
        row("Sal fina", "106", "Paquete 500 g", 70000),
        row("Aceite de oliva extra virgen x500 ml Olivares del Sur", null, "Unidad", 900000),
        row("Aceite de oliva extra virgen x500 ml Olivares del Sur", null, "x5u", 4250000),
      ],
    });
  });

  it("reads an empty catalog as no rows", async () => {
    expect(await catalogs.rows(bytesOf([]))).toEqual({ kind: "read", rows: [] });
  });

  it.each([
    ["bytes that are not JSON", new TextEncoder().encode("<html>")],
    ["a JSON object", bytesOf({ productos: [] })],
    ["a JSON string", bytesOf("hola")],
    ["null", bytesOf(null)],
  ])("cannot read %s", async (_name, bytes) => {
    expect(await catalogs.rows(bytes)).toEqual({ kind: "unreadable" });
  });

  it("cannot read a catalog with more rows than a list may have", async () => {
    const entries = Array.from({ length: PRICE_LIST_EXTRACTION_MAX_ROWS + 1 }, (_, index) => ({
      id: index,
      nombre: `Producto ${index}`,
      precio: 100,
    }));

    expect(await catalogs.rows(bytesOf(entries))).toEqual({ kind: "unreadable" });
  });

  it("reads a catalog with as many rows as a list may have", async () => {
    const entries = Array.from({ length: PRICE_LIST_EXTRACTION_MAX_ROWS }, (_, index) => ({
      id: index,
      nombre: `Producto ${index}`,
      precio: 100,
    }));

    expect(await rowsOf(entries)).toHaveLength(PRICE_LIST_EXTRACTION_MAX_ROWS);
  });

  it("reads a catalog whose readable rows fit in a list, whatever entries it skips", async () => {
    const entries = [
      ...Array.from({ length: PRICE_LIST_EXTRACTION_MAX_ROWS }, (_, index) => ({
        id: index,
        nombre: `Producto ${index}`,
        precio: 100,
      })),
      { id: "sin-nombre", precio: 100 },
    ];

    expect(await rowsOf(entries)).toHaveLength(PRICE_LIST_EXTRACTION_MAX_ROWS);
  });

  it("skips entries that are not objects or have no name", async () => {
    expect(
      await rowsOf([
        null,
        "Sal",
        7,
        [],
        { id: 1, precio: 100 },
        { id: 2, nombre: "   ", precio: 100 },
        { id: 3, nombre: 12, precio: 100 },
        { id: 4, nombre: "Sal fina", precio: 100 },
      ]),
    ).toEqual([row("Sal fina", "4", null, 10000)]);
  });

  describe("the description", () => {
    it("trims the name and the brand", async () => {
      const [first] = await rowsOf([{ nombre: "  Sal fina ", marca: " Campo Verde  " }]);

      expect(first?.description).toBe("Sal fina Campo Verde");
    });

    it.each([undefined, null, "", "   ", 5])(
      "is the name alone for the brand %j",
      async (marca) => {
        const [first] = await rowsOf([{ nombre: "Sal fina", marca }]);

        expect(first?.description).toBe("Sal fina");
      },
    );

    it("leaves the unit out", async () => {
      const [first] = await rowsOf([
        { nombre: "Sal fina", marca: "Campo Verde", unidad: "x5u ($650 c/u)" },
      ]);

      expect(first?.description).toBe("Sal fina Campo Verde");
    });

    it("is cut to the longest description a row may have, in code points", async () => {
      const [first] = await rowsOf([
        { nombre: "😀".repeat(PRICE_LIST_EXTRACTION_MAX_DESCRIPTION_LENGTH + 10) },
      ]);

      expect(first?.description).toBe("😀".repeat(PRICE_LIST_EXTRACTION_MAX_DESCRIPTION_LENGTH));
    });
  });

  describe("the presentation", () => {
    it("is the trimmed unit", async () => {
      const [first] = await rowsOf([{ nombre: "Sal", unidad: " Pack x 6 " }]);

      expect(first?.presentation).toBe("Pack x 6");
    });

    it("leaves out the unit's price per unit, so a later list keeps matching each pack size", async () => {
      const [earlier] = await rowsOf([{ nombre: "Sal fina", unidad: "x5u ($650 c/u)" }]);
      const [later] = await rowsOf([{ nombre: "Sal fina", unidad: " x5u  ( $700 C/U ) " }]);
      if (earlier === undefined || later === undefined) {
        throw new Error("test setup: expected a row of each list");
      }

      expect(earlier.presentation).toBe("x5u");
      expect(later.presentation).toBe("x5u");
      expect(supplierItemKey(earlier)).toEqual(supplierItemKey(later));
    });

    it("tells each pack size of a product with no code apart as its own item", async () => {
      const [unit, pack] = await rowsOf([
        { nombre: "Sal fina", marca: "Campo Verde", unidad: "Unidad", precio: 700 },
        { nombre: "Sal fina", marca: "Campo Verde", unidad: "x5u ($650 c/u)", precio: 3250 },
      ]);
      if (unit === undefined || pack === undefined) {
        throw new Error("test setup: expected two rows");
      }

      expect(supplierItemKey(unit)).not.toEqual(supplierItemKey(pack));
    });

    it("keeps a parenthesis of the unit that is not a price per unit", async () => {
      const [first] = await rowsOf([{ nombre: "Sal fina", unidad: "Pack (6 u)" }]);

      expect(first?.presentation).toBe("Pack (6 u)");
    });

    it.each([undefined, null, "", "  ", 3, "($650 c/u)", " ( $650 C/U ) "])(
      "is none for the unit %j",
      async (unidad) => {
        const [first] = await rowsOf([{ nombre: "Sal", unidad }]);

        expect(first?.presentation).toBeNull();
      },
    );

    it("is cut to the longest short text a row may have", async () => {
      const [first] = await rowsOf([
        { nombre: "Sal", unidad: "u".repeat(PRICE_LIST_EXTRACTION_MAX_SHORT_TEXT_LENGTH + 5) },
      ]);

      expect(first?.presentation).toBe("u".repeat(PRICE_LIST_EXTRACTION_MAX_SHORT_TEXT_LENGTH));
    });
  });

  describe("the code", () => {
    it.each([
      [12, "12"],
      [" abc ", "abc"],
      [0, "0"],
    ])("is the id %j as text", async (id, expected) => {
      const [first] = await rowsOf([{ nombre: "Sal", id }]);

      expect(first?.code).toBe(expected);
    });

    it.each([undefined, null, "", "  ", Number.NaN, true, {}])(
      "is none for the id %j",
      async (id) => {
        const [first] = await rowsOf([{ nombre: "Sal", id }]);

        expect(first?.code).toBeNull();
      },
    );

    it("is cut to the longest short text a row may have", async () => {
      const [first] = await rowsOf([
        { nombre: "Sal", id: "c".repeat(PRICE_LIST_EXTRACTION_MAX_SHORT_TEXT_LENGTH + 5) },
      ]);

      expect(first?.code).toBe("c".repeat(PRICE_LIST_EXTRACTION_MAX_SHORT_TEXT_LENGTH));
    });
  });

  describe("the price", () => {
    it.each([
      [1234.5, 123450],
      ["1234.5", 123450],
      [" 700 ", 70000],
      [0, 0],
      [0.1 + 0.2, 30],
      [19.99, 1999],
    ])("turns %j into cents", async (precio, expected) => {
      const [first] = await rowsOf([{ nombre: "Sal", precio }]);

      expect(first?.priceCents).toBe(expected);
    });

    it.each([undefined, null, "", "  ", "caro", "1.234,50", Number.NaN, true, {}])(
      "is none for %j",
      async (precio) => {
        const [first] = await rowsOf([{ nombre: "Sal", precio }]);

        expect(first?.priceCents).toBeNull();
      },
    );
  });
});

function row(description: string, code: string | null, presentation: string | null, cents: number) {
  return {
    description,
    code,
    presentation,
    priceCents: cents,
    page: null,
    barcode: null,
  };
}
