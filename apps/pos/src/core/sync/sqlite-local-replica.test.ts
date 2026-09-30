import type { BranchSettingsBody, SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const LOCATION_ID = "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10";

function settingsRow(overrides: Partial<BranchSettingsBody> = {}): BranchSettingsBody {
  return {
    address: "Av. Belgrano 1450, CABA",
    whatsapp_number: "+54 9 11 3333-2211",
    instagram_handle: "@purosur.dietetica",
    monday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
    tuesday_hours: [],
    wednesday_hours: [],
    thursday_hours: [],
    friday_hours: [],
    saturday_hours: [],
    sunday_hours: [{ opens_at: "10:00", closes_at: "14:00" }],
    expiring_lot_alert_days: 30,
    unreviewed_price_alert_days: 30,
    good_condition_return_days: 15,
    version: 2,
    ...overrides,
  };
}

function branchSettingsChange(changeSeq: number, row: BranchSettingsBody): RegisterPulledChange {
  return {
    changeSeq,
    change: { change_seq: changeSeq, entity: "branch_settings", entity_id: LOCATION_ID, row },
  };
}

const CATEGORY_ID = "9b2f1c3e-58a4-4f0e-8a4d-3c1f7a5e2d10";
const PRODUCT_ID = "0b1d2f4a-6c3e-4b7d-9a58-1e2f3a4b5c6d";
const PRICE_LIST_ID = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const PRICE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

type CategoryRow = Extract<SyncChange, { entity: "category" }>["row"];
type ProductRow = Extract<SyncChange, { entity: "product" }>["row"];
type PriceListRow = Extract<SyncChange, { entity: "price_list" }>["row"];
type PriceRow = Extract<SyncChange, { entity: "price" }>["row"];

function categoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return { name: "Almacén", parent_id: null, version: 1, ...overrides };
}

function productRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    name: "Arroz largo fino 1 kg",
    category_id: CATEGORY_ID,
    brand_id: null,
    sale_unit: "UNIT",
    active: true,
    net_content: { quantity: 1, unit: "KG" },
    barcodes: [
      { position: 0, code: "7790001000011" },
      { position: 1, code: "7790001000028" },
    ],
    version: 1,
    ...overrides,
  };
}

function priceListRow(overrides: Partial<PriceListRow> = {}): PriceListRow {
  return { name: "Lista general", version: 1, ...overrides };
}

function priceRow(overrides: Partial<PriceRow> = {}): PriceRow {
  return {
    product_id: PRODUCT_ID,
    price_list_id: PRICE_LIST_ID,
    unit_price: 125050,
    valid_from: "2026-09-29T12:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function pulled(change: SyncChange): RegisterPulledChange {
  return { changeSeq: change.change_seq, change };
}

function categoryChange(changeSeq: number, row: CategoryRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "category", entity_id: CATEGORY_ID, row });
}

function productChange(changeSeq: number, row: ProductRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "product", entity_id: PRODUCT_ID, row });
}

function priceListChange(changeSeq: number, row: PriceListRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "price_list", entity_id: PRICE_LIST_ID, row });
}

function priceChange(changeSeq: number, row: PriceRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "price", entity_id: PRICE_ID, row });
}

function removalChange(
  changeSeq: number,
  removedEntity: "category" | "product" | "price",
  entityId: string,
  version: number,
): RegisterPulledChange {
  return pulled({
    change_seq: changeSeq,
    entity: "removal",
    entity_id: entityId,
    removed_entity: removedEntity,
    version,
  });
}

async function save(...changes: RegisterPulledChange[]) {
  const cursor = changes.at(-1)?.changeSeq ?? 0;
  await replica.savePage({ changes, cursor, hasMore: false });
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS);
  replica = new SqliteLocalReplica(database);
});

afterEach(() => {
  database.close();
});

function storedBranchSettings() {
  return replica.branchSettings(LOCATION_ID);
}

describe("the register's local copy of what it pulls", () => {
  it("starts a brand-new installation at the very first cursor, holding no branch settings", async () => {
    expect(await replica.savedCursor()).toBe(0);
    expect(storedBranchSettings()).toBeUndefined();
  });

  it("saves a page's branch settings together with the page's cursor", async () => {
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow())],
      cursor: 7,
      hasMore: false,
    });

    expect(await replica.savedCursor()).toBe(7);
    expect(storedBranchSettings()).toEqual(settingsRow());
  });

  it("keeps the newer version when an older or the same one arrives again, still moving the cursor", async () => {
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow({ version: 3, address: "Nueva" }))],
      cursor: 7,
      hasMore: false,
    });

    await replica.savePage({
      changes: [
        branchSettingsChange(8, settingsRow({ version: 2, address: "Vieja" })),
        branchSettingsChange(9, settingsRow({ version: 3, address: "Otra" })),
      ],
      cursor: 9,
      hasMore: false,
    });

    expect(storedBranchSettings()).toMatchObject({ version: 3, address: "Nueva" });
    expect(await replica.savedCursor()).toBe(9);
  });

  it("replaces the settings with a newer version", async () => {
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow())],
      cursor: 7,
      hasMore: false,
    });

    await replica.savePage({
      changes: [branchSettingsChange(8, settingsRow({ version: 3, sunday_hours: [] }))],
      cursor: 8,
      hasMore: false,
    });

    expect(storedBranchSettings()).toEqual(settingsRow({ version: 3, sunday_hours: [] }));
  });

  it("records the installation it holds the cursor for", () => {
    replica.adoptDevice("device-a");

    expect(database.prepare("SELECT device_id FROM sync_state WHERE id = 1").get()).toEqual({
      device_id: "device-a",
    });
  });

  it("keeps its cursor for the installation that pulled it", async () => {
    replica.adoptDevice("device-a");
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow())],
      cursor: 7,
      hasMore: false,
    });

    replica.adoptDevice("device-a");

    expect(await replica.savedCursor()).toBe(7);
  });

  it("starts over from the very first cursor when another installation takes over, keeping what it holds", async () => {
    replica.adoptDevice("device-a");
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow())],
      cursor: 7,
      hasMore: false,
    });

    replica.adoptDevice("device-b");

    expect(await replica.savedCursor()).toBe(0);
    expect(storedBranchSettings()).toEqual(settingsRow());
  });

  it("saves neither the data nor the cursor when the page can't be saved whole", async () => {
    database.exec(
      "CREATE TRIGGER refuse_cursor BEFORE UPDATE ON sync_state BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );

    await expect(
      replica.savePage({
        changes: [branchSettingsChange(7, settingsRow())],
        cursor: 7,
        hasMore: false,
      }),
    ).rejects.toThrow("disk full");

    expect(await replica.savedCursor()).toBe(0);
    expect(storedBranchSettings()).toBeUndefined();
  });

  it("saves a page's categories, products with their barcodes, price lists and prices, each with its version and none of them removed", async () => {
    await save(
      categoryChange(1, categoryRow({ version: 3 })),
      productChange(2, productRow({ version: 4 })),
      priceListChange(3, priceListRow({ version: 2 })),
      priceChange(4, priceRow()),
    );

    expect(replica.category(CATEGORY_ID)).toEqual({
      ...categoryRow({ version: 3 }),
      removed: false,
    });
    expect(replica.product(PRODUCT_ID)).toEqual({
      ...productRow({ version: 4 }),
      barcodes: [
        { position: 0, code: "7790001000011", active: true },
        { position: 1, code: "7790001000028", active: true },
      ],
      removed: false,
    });
    expect(replica.priceList(PRICE_LIST_ID)).toEqual({ name: "Lista general", version: 2 });
    expect(replica.price(PRICE_ID)).toEqual({ ...priceRow(), removed: false });
    expect(await replica.savedCursor()).toBe(4);
  });

  it("saves a product with no net content and no barcode", async () => {
    await save(productChange(1, productRow({ net_content: null, barcodes: [] })));

    expect(replica.product(PRODUCT_ID)).toMatchObject({ net_content: null, barcodes: [] });
  });

  it("replaces a product with a newer version, marking the barcodes it no longer has as inactive instead of deleting them", async () => {
    await save(productChange(1, productRow()));

    await save(
      productChange(
        2,
        productRow({
          name: "Arroz largo fino",
          active: false,
          barcodes: [{ position: 0, code: "7790001000035" }],
          version: 2,
        }),
      ),
    );

    expect(replica.product(PRODUCT_ID)).toMatchObject({
      name: "Arroz largo fino",
      active: false,
      barcodes: [
        { position: 0, code: "7790001000035", active: true },
        { position: 1, code: "7790001000028", active: false },
      ],
      version: 2,
    });
  });

  it("marks a barcode active again when a newer version brings its position back", async () => {
    await save(
      productChange(1, productRow()),
      productChange(
        2,
        productRow({ barcodes: [{ position: 0, code: "7790001000011" }], version: 2 }),
      ),
    );

    await save(productChange(3, productRow({ version: 3 })));

    expect(replica.product(PRODUCT_ID)?.barcodes).toEqual([
      { position: 0, code: "7790001000011", active: true },
      { position: 1, code: "7790001000028", active: true },
    ]);
  });

  it.each([
    ["an older", 2],
    ["the same", 3],
  ])(
    "keeps a product, with its barcodes, when %s version of it arrives",
    async (_case, version) => {
      await save(productChange(1, productRow({ name: "Nueva", version: 3 })));

      await save(
        productChange(
          2,
          productRow({
            name: "Vieja",
            barcodes: [{ position: 0, code: "7790009999999" }],
            version,
          }),
        ),
      );

      expect(replica.product(PRODUCT_ID)).toMatchObject({
        name: "Nueva",
        barcodes: [
          { position: 0, code: "7790001000011", active: true },
          { position: 1, code: "7790001000028", active: true },
        ],
        version: 3,
      });
      expect(await replica.savedCursor()).toBe(2);
    },
  );

  it("keeps a category when an older or the same version of it arrives", async () => {
    await save(categoryChange(1, categoryRow({ name: "Nueva", version: 3 })));

    await save(
      categoryChange(2, categoryRow({ name: "Vieja", version: 2 })),
      categoryChange(3, categoryRow({ name: "Otra", version: 3 })),
    );

    expect(replica.category(CATEGORY_ID)).toMatchObject({ name: "Nueva", version: 3 });
  });

  it("keeps a price list when an older or the same version of it arrives", async () => {
    await save(priceListChange(1, priceListRow({ name: "Nueva", version: 3 })));

    await save(
      priceListChange(2, priceListRow({ name: "Vieja", version: 2 })),
      priceListChange(3, priceListRow({ name: "Otra", version: 3 })),
    );

    expect(replica.priceList(PRICE_LIST_ID)).toEqual({ name: "Nueva", version: 3 });
  });

  it("keeps a price when an older or the same version of it arrives", async () => {
    await save(priceChange(1, priceRow({ unit_price: 999, version: 3 })));

    await save(
      priceChange(2, priceRow({ unit_price: 1, version: 2 })),
      priceChange(3, priceRow({ unit_price: 2, version: 3 })),
    );

    expect(replica.price(PRICE_ID)).toMatchObject({ unit_price: 999, version: 3 });
  });

  it("replaces a category, a price list and a price with a newer version", async () => {
    await save(
      categoryChange(1, categoryRow()),
      priceListChange(2, priceListRow()),
      priceChange(3, priceRow()),
    );

    await save(
      categoryChange(
        4,
        categoryRow({ name: "Almacén y secos", parent_id: PRODUCT_ID, version: 2 }),
      ),
      priceListChange(5, priceListRow({ name: "Lista minorista", version: 2 })),
      priceChange(6, priceRow({ unit_price: 130000, version: 2 })),
    );

    expect(replica.category(CATEGORY_ID)).toMatchObject({
      name: "Almacén y secos",
      parent_id: PRODUCT_ID,
      version: 2,
    });
    expect(replica.priceList(PRICE_LIST_ID)).toMatchObject({ name: "Lista minorista", version: 2 });
    expect(replica.price(PRICE_ID)).toMatchObject({ unit_price: 130000, version: 2 });
  });

  it("marks what a removal names as removed, at its version, keeping the row and, for a product, marking its barcodes inactive", async () => {
    await save(
      categoryChange(1, categoryRow()),
      productChange(2, productRow()),
      priceChange(3, priceRow()),
    );

    await save(
      removalChange(4, "category", CATEGORY_ID, 2),
      removalChange(5, "product", PRODUCT_ID, 2),
      removalChange(6, "price", PRICE_ID, 2),
    );

    expect(replica.category(CATEGORY_ID)).toEqual({
      ...categoryRow({ version: 2 }),
      removed: true,
    });
    expect(replica.product(PRODUCT_ID)).toEqual({
      ...productRow({ version: 2 }),
      barcodes: [
        { position: 0, code: "7790001000011", active: false },
        { position: 1, code: "7790001000028", active: false },
      ],
      removed: true,
    });
    expect(replica.price(PRICE_ID)).toEqual({ ...priceRow({ version: 2 }), removed: true });
  });

  it("ignores a removal older than the row it holds", async () => {
    await save(
      categoryChange(1, categoryRow({ version: 3 })),
      productChange(2, productRow({ version: 3 })),
      priceChange(3, priceRow({ version: 3 })),
    );

    await save(
      removalChange(4, "category", CATEGORY_ID, 3),
      removalChange(5, "product", PRODUCT_ID, 2),
      removalChange(6, "price", PRICE_ID, 1),
    );

    expect(replica.category(CATEGORY_ID)).toMatchObject({ removed: false, version: 3 });
    expect(replica.product(PRODUCT_ID)).toMatchObject({
      removed: false,
      version: 3,
      barcodes: [{ active: true }, { active: true }],
    });
    expect(replica.price(PRICE_ID)).toMatchObject({ removed: false, version: 3 });
  });

  it("changes nothing for a removal of a row it never held", async () => {
    await save(
      removalChange(4, "category", CATEGORY_ID, 2),
      removalChange(5, "product", PRODUCT_ID, 2),
      removalChange(6, "price", PRICE_ID, 2),
    );

    expect(replica.category(CATEGORY_ID)).toBeUndefined();
    expect(replica.product(PRODUCT_ID)).toBeUndefined();
    expect(replica.price(PRICE_ID)).toBeUndefined();
    expect(await replica.savedCursor()).toBe(6);
  });

  it("does not bring a row back when an older version of it arrives after its removal", async () => {
    await save(
      categoryChange(1, categoryRow()),
      productChange(2, productRow()),
      priceChange(3, priceRow()),
    );
    await save(
      removalChange(4, "category", CATEGORY_ID, 2),
      removalChange(5, "product", PRODUCT_ID, 2),
      removalChange(6, "price", PRICE_ID, 2),
    );

    await save(
      categoryChange(7, categoryRow()),
      productChange(8, productRow()),
      priceChange(9, priceRow()),
    );

    expect(replica.category(CATEGORY_ID)).toMatchObject({ removed: true, version: 2 });
    expect(replica.product(PRODUCT_ID)).toMatchObject({
      removed: true,
      version: 2,
      barcodes: [{ active: false }, { active: false }],
    });
    expect(replica.price(PRICE_ID)).toMatchObject({ removed: true, version: 2 });
  });

  it("saves nothing of a page with catalog rows, nor its cursor, when the page can't be saved whole", async () => {
    database.exec(
      "CREATE TRIGGER refuse_barcodes BEFORE INSERT ON product_barcodes BEGIN SELECT RAISE(ABORT, 'disk full'); END",
    );

    await expect(
      save(categoryChange(1, categoryRow()), productChange(2, productRow())),
    ).rejects.toThrow("disk full");

    expect(replica.category(CATEGORY_ID)).toBeUndefined();
    expect(replica.product(PRODUCT_ID)).toBeUndefined();
    expect(await replica.savedCursor()).toBe(0);
  });
});
