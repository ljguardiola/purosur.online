import { describe, expect, it } from "vitest";
import { changesPageSchema, changesQuerySchema } from "./changes.js";

const settingsRow = {
  address: "Av. Belgrano 1450, CABA",
  whatsapp_number: "+54 9 11 3333-2211",
  instagram_handle: "@purosur.dietetica",
  monday_hours: [{ opens_at: "09:00", closes_at: "13:00" }],
  tuesday_hours: [],
  wednesday_hours: [],
  thursday_hours: [],
  friday_hours: [],
  saturday_hours: [],
  sunday_hours: [],
  expiring_lot_alert_days: 30,
  unreviewed_price_alert_days: 30,
  good_condition_return_days: 15,
  version: 3,
};

function branchSettingsChange(changeSeq: number) {
  return {
    change_seq: changeSeq,
    entity: "branch_settings",
    entity_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
    row: settingsRow,
  };
}

const ENTITY_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const categoryRow = { name: "Almacén", parent_id: null, version: 1 };

const productRow = {
  name: "Arroz largo fino 1 kg",
  category_id: "9b2f1c3e-58a4-4f0e-8a4d-3c1f7a5e2d10",
  brand_id: null,
  sale_unit: "UNIT",
  active: true,
  net_content: { quantity: 1, unit: "KG" },
  barcodes: [
    { position: 0, code: "7790001000011" },
    { position: 1, code: "2000000000017" },
  ],
  tag_ids: ["3d594650-3436-4a2b-9b14-6a1f0f3b9a11"],
  version: 2,
};

const tagRow = { name: "Sin TACC", active: true, version: 1 };

const priceListRow = { name: "Lista minorista", version: 1 };

const userRow = {
  first_name: "Ada",
  role_id: "1e7b3a90-52c4-4d18-9f6a-8b0c2d4e6f71",
  salt: "c2FsdC1vZi1hZGE",
  pin_hash: "cGluLWhhc2gtb2YtYWRh",
  active: true,
  version: 2,
};

const roleRow = {
  name: "Cajera",
  is_administrator: false,
  permission_keys: ["sell_and_charge", "adjust_stock"],
  version: 3,
};

const priceRow = {
  product_id: "0b1d2f4a-6c3e-4b7d-9a58-1e2f3a4b5c6d",
  price_list_id: "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
  unit_price: 125050,
  valid_from: "2026-09-29T12:00:00.000Z",
  version: 1,
};

function change(changeSeq: number, entity: string, row: unknown) {
  return { change_seq: changeSeq, entity, entity_id: ENTITY_ID, row };
}

function removal(changeSeq: number, removedEntity: string, version: number) {
  return {
    change_seq: changeSeq,
    entity: "removal",
    entity_id: ENTITY_ID,
    removed_entity: removedEntity,
    version,
  };
}

function pageOf(...changes: unknown[]) {
  return { changes, cursor: changes.length, has_more: false };
}

describe("changesQuerySchema", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("reads since=%s as the cursor %s", (since, cursor) => {
    expect(changesQuerySchema.parse({ since })).toEqual({ since: cursor });
  });

  it.each([
    ["missing", {}],
    ["negative", { since: "-1" }],
    ["fractional", { since: "1.5" }],
    ["written with a leading zero", { since: "01" }],
    ["written with an exponent", { since: "1e3" }],
    ["empty", { since: "" }],
    ["not a number", { since: "abc" }],
    ["beyond a safe integer", { since: "9007199254740992" }],
    ["repeated", { since: ["1", "2"] }],
  ])("refuses a since that is %s, naming the field", (_case, query) => {
    const result = changesQuerySchema.safeParse(query);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["since"]);
    expect(result.error?.issues[0]?.message).toBe(
      "since must be the cursor of the last page already pulled, 0 the first time",
    );
  });
});

describe("changesPageSchema", () => {
  it("accepts a page of branch settings changes with its cursor and whether more wait", () => {
    const page = { changes: [branchSettingsChange(4)], cursor: 4, has_more: true };

    expect(changesPageSchema.parse(page)).toEqual(page);
  });

  it.each([
    ["a category", change(1, "category", categoryRow)],
    ["a category under another", change(1, "category", { ...categoryRow, parent_id: ENTITY_ID })],
    ["a product with its barcodes", change(1, "product", productRow)],
    [
      "a product with no net content and no barcode",
      change(1, "product", { ...productRow, net_content: null, barcodes: [] }),
    ],
    [
      "a product of a brand, sold by the kilo",
      change(1, "product", { ...productRow, brand_id: ENTITY_ID, sale_unit: "KG" }),
    ],
    ["a deactivated product", change(1, "product", { ...productRow, active: false })],
    ["a tag", change(1, "tag", tagRow)],
    ["a deactivated tag", change(1, "tag", { ...tagRow, active: false, version: 2 })],
    ["a product with no tag", change(1, "product", { ...productRow, tag_ids: [] })],
    ["the removal of a tag", removal(1, "tag", 2)],
    ["a price list", change(1, "price_list", priceListRow)],
    ["a price", change(1, "price", priceRow)],
    ["the removal of a category", removal(1, "category", 2)],
    ["the removal of a product", removal(1, "product", 3)],
    ["the removal of a price", removal(1, "price", 2)],
    ["a user", change(1, "user", userRow)],
    ["a deactivated user", change(1, "user", { ...userRow, active: false, version: 3 })],
    ["a user with no PIN", change(1, "user", { ...userRow, salt: null, pin_hash: null })],
    ["a role", change(1, "role", roleRow)],
    ["a role that grants nothing", change(1, "role", { ...roleRow, permission_keys: [] })],
    [
      "the Administrator role",
      change(1, "role", { name: null, is_administrator: true, permission_keys: [], version: 1 }),
    ],
    ["the removal of a user", removal(1, "user", 4)],
    ["the removal of a role", removal(1, "role", 4)],
  ])("accepts %s", (_case, entry) => {
    const page = pageOf(entry);

    expect(changesPageSchema.parse(page)).toEqual(page);
  });

  it("accepts every kind of change in one page", () => {
    const page = pageOf(
      branchSettingsChange(1),
      change(2, "category", categoryRow),
      change(3, "product", productRow),
      change(4, "price_list", priceListRow),
      change(7, "tag", tagRow),
      change(8, "user", userRow),
      change(9, "role", roleRow),
      change(5, "price", priceRow),
      removal(6, "product", 3),
    );

    expect(changesPageSchema.parse(page)).toEqual(page);
  });

  it("keeps nothing of a user but the fields a register may hold", () => {
    const page = pageOf(
      change(1, "user", { ...userRow, email: "ada@example.com", location_id: ENTITY_ID }),
    );

    expect(changesPageSchema.parse(page).changes[0]).toEqual(change(1, "user", userRow));
  });

  it("accepts an empty last page", () => {
    const page = { changes: [], cursor: 0, has_more: false };

    expect(changesPageSchema.parse(page)).toEqual(page);
  });

  it("accepts exactly 500 changes", () => {
    const changes = Array.from({ length: 500 }, (_, index) => branchSettingsChange(index + 1));

    expect(changesPageSchema.safeParse({ changes, cursor: 500, has_more: true }).success).toBe(
      true,
    );
  });

  it("refuses more than 500 changes", () => {
    const changes = Array.from({ length: 501 }, (_, index) => branchSettingsChange(index + 1));

    expect(changesPageSchema.safeParse({ changes, cursor: 501, has_more: true }).success).toBe(
      false,
    );
  });

  it.each([
    ["a negative cursor", { changes: [], cursor: -1, has_more: false }],
    ["a fractional cursor", { changes: [], cursor: 1.5, has_more: false }],
    [
      "a change of an entity it does not know",
      {
        changes: [{ ...branchSettingsChange(1), entity: "unknown" }],
        cursor: 1,
        has_more: false,
      },
    ],
    [
      "a change with no sequence number",
      {
        changes: [{ ...branchSettingsChange(1), change_seq: 0 }],
        cursor: 1,
        has_more: false,
      },
    ],
    [
      "a branch settings row without its version",
      {
        changes: [{ ...branchSettingsChange(1), row: { ...settingsRow, version: undefined } }],
        cursor: 1,
        has_more: false,
      },
    ],
    ["no has_more", { changes: [], cursor: 0 }],
    [
      "a category without its version",
      pageOf(change(1, "category", { ...categoryRow, version: undefined })),
    ],
    [
      "a category without its parent field",
      pageOf(change(1, "category", { name: "Almacén", version: 1 })),
    ],
    [
      "a product of a sale unit it does not know",
      pageOf(change(1, "product", { ...productRow, sale_unit: "BOX" })),
    ],
    [
      "a product with a net content of a unit it does not know",
      pageOf(change(1, "product", { ...productRow, net_content: { quantity: 1, unit: "OZ" } })),
    ],
    [
      "a product with a net content lacking its unit",
      pageOf(change(1, "product", { ...productRow, net_content: { quantity: 1 } })),
    ],
    [
      "a product without its barcodes",
      pageOf(change(1, "product", { ...productRow, barcodes: undefined })),
    ],
    [
      "a product barcode without its position",
      pageOf(change(1, "product", { ...productRow, barcodes: [{ code: "7790001000011" }] })),
    ],
    [
      "a product without its active flag",
      pageOf(change(1, "product", { ...productRow, active: undefined })),
    ],
    ["a tag without its active flag", pageOf(change(1, "tag", { ...tagRow, active: undefined }))],
    ["a tag without its name", pageOf(change(1, "tag", { ...tagRow, name: undefined }))],
    [
      "a product without its tags",
      pageOf(change(1, "product", { ...productRow, tag_ids: undefined })),
    ],
    ["a price list without its name", pageOf(change(1, "price_list", { version: 1 }))],
    [
      "a price with a fractional amount",
      pageOf(change(1, "price", { ...priceRow, unit_price: 10.5 })),
    ],
    [
      "a price with a start that is not a date",
      pageOf(change(1, "price", { ...priceRow, valid_from: "yesterday" })),
    ],
    [
      "a price without its price list",
      pageOf(change(1, "price", { ...priceRow, price_list_id: undefined })),
    ],
    ["a user without its name", pageOf(change(1, "user", { ...userRow, first_name: undefined }))],
    ["a user without its role", pageOf(change(1, "user", { ...userRow, role_id: undefined }))],
    ["a user without its salt field", pageOf(change(1, "user", { ...userRow, salt: undefined }))],
    [
      "a user without its PIN hash field",
      pageOf(change(1, "user", { ...userRow, pin_hash: undefined })),
    ],
    [
      "a user without its active flag",
      pageOf(change(1, "user", { ...userRow, active: undefined })),
    ],
    ["a user without its version", pageOf(change(1, "user", { ...userRow, version: undefined }))],
    ["a role without its name field", pageOf(change(1, "role", { ...roleRow, name: undefined }))],
    [
      "a role without its Administrator flag",
      pageOf(change(1, "role", { ...roleRow, is_administrator: undefined })),
    ],
    [
      "a role without its permissions",
      pageOf(change(1, "role", { ...roleRow, permission_keys: undefined })),
    ],
    ["a role without its version", pageOf(change(1, "role", { ...roleRow, version: undefined }))],
    ["a removal of an entity that is never removed", pageOf(removal(1, "price_list", 2))],
    ["a removal of the branch settings", pageOf(removal(1, "branch_settings", 2))],
    ["a removal without its version", pageOf({ ...removal(1, "product", 2), version: undefined })],
    ["a removal with no sequence number", pageOf(removal(0, "product", 2))],
  ])("refuses %s", (_case, page) => {
    expect(changesPageSchema.safeParse(page).success).toBe(false);
  });
});
