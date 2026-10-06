import { createHmac } from "node:crypto";
import type { BranchSettingsBody, SyncChange } from "@purosur/contracts";
import type { OutboxEventDraft } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";
import { appendOutboxEvent } from "./sqlite-outbox";

const LOCATION_ID = "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");

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
const TAG_ID = "3d594650-3436-4a2b-9b14-6a1f0f3b9a11";
const OTHER_TAG_ID = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const PRICE_LIST_ID = "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const PRICE_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

type CategoryRow = Extract<SyncChange, { entity: "category" }>["row"];
type ProductRow = Extract<SyncChange, { entity: "product" }>["row"];
type TagRow = Extract<SyncChange, { entity: "tag" }>["row"];
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
    tag_ids: [],
    version: 1,
    ...overrides,
  };
}

function tagRow(overrides: Partial<TagRow> = {}): TagRow {
  return { name: "Sin TACC", active: true, version: 1, ...overrides };
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

function tagChange(changeSeq: number, row: TagRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "tag", entity_id: TAG_ID, row });
}

function priceListChange(changeSeq: number, row: PriceListRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "price_list", entity_id: PRICE_LIST_ID, row });
}

function priceChange(changeSeq: number, row: PriceRow): RegisterPulledChange {
  return pulled({ change_seq: changeSeq, entity: "price", entity_id: PRICE_ID, row });
}

function removalChange(
  changeSeq: number,
  removedEntity: "category" | "product" | "tag" | "price",
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
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  replica = new SqliteLocalReplica(database);
});

afterEach(() => {
  database.close();
});

function storedBranchSettings() {
  return replica.branchSettings(LOCATION_ID);
}

const CHAIN_KEY = Buffer.alloc(32, 9).toString("base64");
const SECOND_EVENT_ID = "018f0000-0000-7000-8000-000000000002";
const THIRD_EVENT_ID = "018f0000-0000-7000-8000-000000000003";

function outboxDraft(overrides: Partial<OutboxEventDraft> = {}): OutboxEventDraft {
  return {
    event_id: "018f0000-0000-7000-8000-000000000001",
    aggregate_type: "CashSession",
    aggregate_id: "session-1",
    event_type: "cash_session_opened",
    schema_version: 1,
    payload: { opening_float: 5000, opened_by: "u1" },
    occurred_at: "2026-09-30T12:00:00.000Z",
    actor_id: "u1",
    ...overrides,
  };
}

function outboxSeqs(): number[] {
  return database
    .prepare<[], { device_seq: number }>("SELECT device_seq FROM outbox ORDER BY device_seq")
    .all()
    .map((row) => row.device_seq);
}

function outboxOwners(): [string, number][] {
  return database
    .prepare<[], { device_id: string; device_seq: number }>(
      "SELECT device_id, device_seq FROM outbox ORDER BY device_id, device_seq",
    )
    .all()
    .map((row) => [row.device_id, row.device_seq]);
}

function firstChainHmacOf(deviceId: string): string | undefined {
  return database
    .prepare<[string], { chain_hmac: string }>(
      "SELECT chain_hmac FROM outbox WHERE device_id = ? AND device_seq = 1",
    )
    .get(deviceId)?.chain_hmac;
}

function chainPosition() {
  return database
    .prepare<[], { last_device_seq: number; last_chain_hmac: string | null }>(
      "SELECT last_device_seq, last_chain_hmac FROM sync_state",
    )
    .get();
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
    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });

    expect(database.prepare("SELECT device_id FROM sync_state WHERE id = 1").get()).toEqual({
      device_id: "device-a",
    });
  });

  it("keeps its cursor for the installation that pulled it", async () => {
    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow())],
      cursor: 7,
      hasMore: false,
    });

    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });

    expect(await replica.savedCursor()).toBe(7);
  });

  it("starts over from the very first cursor when another installation takes over, keeping what it holds", async () => {
    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
    await replica.savePage({
      changes: [branchSettingsChange(7, settingsRow())],
      cursor: 7,
      hasMore: false,
    });

    replica.adoptDevice({ deviceId: "device-b", pepper: PEPPER });

    expect(await replica.savedCursor()).toBe(0);
    expect(storedBranchSettings()).toEqual(settingsRow());
  });

  it("keeps its outbox and chain position for the installation that wrote them", () => {
    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
    appendOutboxEvent(database, CHAIN_KEY, outboxDraft());

    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });

    expect(outboxSeqs()).toEqual([1]);
    expect(chainPosition()).toEqual({ last_device_seq: 1, last_chain_hmac: expect.any(String) });
  });

  it("keeps the previous installation's unsent events and starts the new one's chain over when another installation takes over", () => {
    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
    appendOutboxEvent(database, CHAIN_KEY, outboxDraft());
    appendOutboxEvent(database, CHAIN_KEY, outboxDraft({ event_id: SECOND_EVENT_ID }));

    replica.adoptDevice({ deviceId: "device-b", pepper: PEPPER });

    expect(chainPosition()).toEqual({ last_device_seq: 0, last_chain_hmac: null });
    appendOutboxEvent(database, CHAIN_KEY, outboxDraft({ event_id: THIRD_EVENT_ID }));
    expect(outboxOwners()).toEqual([
      ["device-a", 1],
      ["device-a", 2],
      ["device-b", 1],
    ]);
    expect(firstChainHmacOf("device-b")).toBe(
      createHmac("sha256", Buffer.from(CHAIN_KEY, "base64"))
        .update(Buffer.alloc(32))
        .update(
          Buffer.from(
            '{"actor_id":"u1","aggregate_id":"session-1","aggregate_type":"CashSession","device_seq":1,"event_id":"018f0000-0000-7000-8000-000000000003","event_type":"cash_session_opened","occurred_at":"2026-09-30T12:00:00.000Z","payload":{"opened_by":"u1","opening_float":5000},"schema_version":1}',
            "utf8",
          ),
        )
        .digest("base64"),
    );
  });

  it("lets a new installation sell where the one before was stopped, and keeps the same one stopped", () => {
    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
    database
      .prepare("UPDATE sync_state SET installation_revoked_at = '2026-09-30T08:00:00.000Z'")
      .run();
    const installationRevokedAt = () =>
      database
        .prepare<[], { installation_revoked_at: string | null }>(
          "SELECT installation_revoked_at FROM sync_state",
        )
        .get()?.installation_revoked_at;

    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
    const sameInstallation = installationRevokedAt();
    replica.adoptDevice({ deviceId: "device-b", pepper: PEPPER });

    expect(sameInstallation).toBe("2026-09-30T08:00:00.000Z");
    expect(installationRevokedAt()).toBeNull();
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
          barcodes: [{ position: 0, code: "7790001000035" }],
          version: 2,
        }),
      ),
    );

    expect(replica.product(PRODUCT_ID)).toMatchObject({
      name: "Arroz largo fino",
      active: true,
      barcodes: [
        { position: 0, code: "7790001000035", active: true },
        { position: 1, code: "7790001000028", active: false },
      ],
      version: 2,
    });
  });

  it("holds the barcodes and tags of an inactive product as inactive, and active again once a newer version reactivates it", async () => {
    await save(productChange(1, productRow({ active: false, tag_ids: [TAG_ID], version: 2 })));

    expect(replica.product(PRODUCT_ID)).toMatchObject({
      active: false,
      barcodes: [{ active: false }, { active: false }],
      tag_ids: [{ tag_id: TAG_ID, active: false }],
    });

    await save(productChange(2, productRow({ tag_ids: [TAG_ID], version: 3 })));

    expect(replica.product(PRODUCT_ID)).toMatchObject({
      active: true,
      barcodes: [{ active: true }, { active: true }],
      tag_ids: [{ tag_id: TAG_ID, active: true }],
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

  it("keeps a price as it first arrived when the same price is delivered again", async () => {
    await save(priceChange(1, priceRow({ unit_price: 999 })));

    await save(priceChange(2, priceRow({ unit_price: 1 })));

    expect(replica.price(PRICE_ID)).toMatchObject({ unit_price: 999, version: 1, removed: false });
  });

  it("replaces a category and a price list with a newer version", async () => {
    await save(categoryChange(1, categoryRow()), priceListChange(2, priceListRow()));

    await save(
      categoryChange(
        4,
        categoryRow({ name: "Almacén y secos", parent_id: PRODUCT_ID, version: 2 }),
      ),
      priceListChange(5, priceListRow({ name: "Lista minorista", version: 2 })),
    );

    expect(replica.category(CATEGORY_ID)).toMatchObject({
      name: "Almacén y secos",
      parent_id: PRODUCT_ID,
      version: 2,
    });
    expect(replica.priceList(PRICE_LIST_ID)).toMatchObject({ name: "Lista minorista", version: 2 });
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
    );

    await save(
      removalChange(4, "category", CATEGORY_ID, 3),
      removalChange(5, "product", PRODUCT_ID, 2),
    );

    expect(replica.category(CATEGORY_ID)).toMatchObject({ removed: false, version: 3 });
    expect(replica.product(PRODUCT_ID)).toMatchObject({
      removed: false,
      version: 3,
      barcodes: [{ active: true }, { active: true }],
    });
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

  it("saves a tag with its version, and a newer version replaces it while an older or the same one does not", async () => {
    await save(tagChange(1, tagRow({ name: "Sin TACC", version: 2 })));
    expect(replica.tag(TAG_ID)).toEqual({ ...tagRow({ version: 2 }), removed: false });

    await save(
      tagChange(2, tagRow({ name: "Vieja", version: 1 })),
      tagChange(3, tagRow({ name: "Otra", version: 2 })),
    );
    expect(replica.tag(TAG_ID)).toMatchObject({ name: "Sin TACC", version: 2 });

    await save(tagChange(4, tagRow({ name: "Libre de gluten", active: false, version: 3 })));
    expect(replica.tag(TAG_ID)).toEqual({
      name: "Libre de gluten",
      active: false,
      version: 3,
      removed: false,
    });
  });

  it("marks a removed tag as removed at its version, keeping it, and ignores a removal of a tag it never held or an older one", async () => {
    await save(tagChange(1, tagRow({ version: 3 })));

    await save(removalChange(2, "tag", TAG_ID, 3), removalChange(3, "tag", OTHER_TAG_ID, 2));
    expect(replica.tag(TAG_ID)).toMatchObject({ removed: false, version: 3 });
    expect(replica.tag(OTHER_TAG_ID)).toBeUndefined();

    await save(removalChange(4, "tag", TAG_ID, 4));
    expect(replica.tag(TAG_ID)).toEqual({ ...tagRow({ version: 4 }), removed: true });
  });

  it("saves the tags a product carries, marking the ones a newer version no longer carries as inactive instead of deleting them", async () => {
    await save(productChange(1, productRow({ tag_ids: [TAG_ID, OTHER_TAG_ID] })));
    expect(replica.product(PRODUCT_ID)?.tag_ids).toEqual([
      { tag_id: TAG_ID, active: true },
      { tag_id: OTHER_TAG_ID, active: true },
    ]);

    await save(productChange(2, productRow({ tag_ids: [TAG_ID], version: 2 })));
    expect(replica.product(PRODUCT_ID)?.tag_ids).toEqual([
      { tag_id: TAG_ID, active: true },
      { tag_id: OTHER_TAG_ID, active: false },
    ]);

    await save(productChange(3, productRow({ tag_ids: [OTHER_TAG_ID, TAG_ID], version: 3 })));
    expect(replica.product(PRODUCT_ID)?.tag_ids).toEqual([
      { tag_id: TAG_ID, active: true },
      { tag_id: OTHER_TAG_ID, active: true },
    ]);
  });

  it("keeps a product's tags when an older version of it arrives, and marks them inactive when the product is removed", async () => {
    await save(productChange(1, productRow({ tag_ids: [TAG_ID], version: 3 })));

    await save(productChange(2, productRow({ tag_ids: [], version: 2 })));
    expect(replica.product(PRODUCT_ID)?.tag_ids).toEqual([{ tag_id: TAG_ID, active: true }]);

    await save(removalChange(3, "product", PRODUCT_ID, 4));
    expect(replica.product(PRODUCT_ID)?.tag_ids).toEqual([{ tag_id: TAG_ID, active: false }]);
  });
});
