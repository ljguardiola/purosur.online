import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const DISCOUNT_ID = "5d1f7ec4-96a8-4c5b-8dae-2f4a6c8e0b15";
const OTHER_DISCOUNT_ID = "6e2a8fd5-a7b9-4d6c-9ebf-3a5b7d9f1c26";
const TAG_ID = "3d594650-3436-4a2b-9b14-6a1f0f3b9a11";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");

type DiscountRow = Extract<SyncChange, { entity: "discount" }>["row"];

function discountRow(overrides: Partial<DiscountRow> = {}): DiscountRow {
  return {
    name: "Martes de infusiones",
    benefit: { kind: "PERCENT_OFF", percent: 10 },
    target: { kind: "TAG", id: TAG_ID },
    valid_from: "2026-10-01",
    valid_to: "2026-10-31",
    weekdays: [2, 4],
    active: true,
    version: 1,
    ...overrides,
  };
}

function discountChange(
  changeSeq: number,
  row: DiscountRow,
  entityId = DISCOUNT_ID,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "discount",
    entity_id: entityId,
    row,
  };
  return { changeSeq, change };
}

function discountRemoval(
  changeSeq: number,
  version: number,
  entityId = DISCOUNT_ID,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "removal",
    entity_id: entityId,
    removed_entity: "discount",
    version,
  };
  return { changeSeq, change };
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
  replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
});

afterEach(() => {
  database.close();
});

describe("the register's local copy of the discounts it pulls", () => {
  it("has no discount before one is pulled", () => {
    expect(replica.discount(DISCOUNT_ID)).toBeUndefined();
  });

  it("saves a discount with its benefit, target, validity, weekdays and version", async () => {
    await save(discountChange(1, discountRow({ version: 3 })));

    expect(replica.discount(DISCOUNT_ID)).toEqual({
      name: "Martes de infusiones",
      kind: "PERCENT_OFF",
      percent: 10,
      target_kind: "TAG",
      target_id: TAG_ID,
      valid_from: "2026-10-01",
      valid_to: "2026-10-31",
      weekdays: [2, 4],
      active: true,
      version: 3,
      removed: false,
    });
  });

  it("keeps a discount that applies every day with no weekday", async () => {
    await save(discountChange(1, discountRow({ weekdays: [] })));

    expect(replica.discount(DISCOUNT_ID)?.weekdays).toEqual([]);
  });

  it("holds a switched off discount as inactive, not as removed", async () => {
    await save(discountChange(1, discountRow({ active: false })));

    expect(replica.discount(DISCOUNT_ID)).toMatchObject({ active: false, removed: false });
  });

  it("replaces every field with a newer version", async () => {
    await save(discountChange(1, discountRow()));

    await save(
      discountChange(
        2,
        discountRow({
          name: "Semana de las infusiones",
          benefit: { kind: "PERCENT_OFF", percent: 25 },
          target: { kind: "PRODUCT", id: OTHER_DISCOUNT_ID },
          valid_from: "2026-11-01",
          valid_to: "2026-11-30",
          weekdays: [6, 7],
          active: false,
          version: 2,
        }),
      ),
    );

    expect(replica.discount(DISCOUNT_ID)).toEqual({
      name: "Semana de las infusiones",
      kind: "PERCENT_OFF",
      percent: 25,
      target_kind: "PRODUCT",
      target_id: OTHER_DISCOUNT_ID,
      valid_from: "2026-11-01",
      valid_to: "2026-11-30",
      weekdays: [6, 7],
      active: false,
      version: 2,
      removed: false,
    });
  });

  it("keeps the discount when the same or an older version arrives late", async () => {
    await save(discountChange(1, discountRow({ name: "Vigente", version: 3 })));

    await save(
      discountChange(2, discountRow({ name: "Vieja", version: 2 })),
      discountChange(3, discountRow({ name: "Repetida", version: 3 })),
    );

    expect(replica.discount(DISCOUNT_ID)).toMatchObject({ name: "Vigente", version: 3 });
  });

  it("marks a removed discount as removed at the version of the removal, never deleting it", async () => {
    await save(discountChange(1, discountRow()));

    await save(discountRemoval(2, 2));

    expect(replica.discount(DISCOUNT_ID)).toMatchObject({
      name: "Martes de infusiones",
      removed: true,
      version: 2,
    });
  });

  it("does not let a removal of an older or the same version remove the discount", async () => {
    await save(discountChange(1, discountRow({ version: 3 })));

    await save(discountRemoval(2, 2), discountRemoval(3, 3));

    expect(replica.discount(DISCOUNT_ID)).toMatchObject({ removed: false, version: 3 });
  });

  it("keeps a removed discount removed when an older version of it arrives late", async () => {
    await save(discountChange(1, discountRow()), discountRemoval(2, 2));

    await save(discountChange(3, discountRow({ name: "Vieja", version: 1 })));

    expect(replica.discount(DISCOUNT_ID)).toMatchObject({ removed: true, version: 2 });
  });

  it("holds each discount on its own", async () => {
    await save(
      discountChange(1, discountRow({ name: "Una" })),
      discountChange(2, discountRow({ name: "Otra" }), OTHER_DISCOUNT_ID),
    );

    await save(discountRemoval(3, 2, OTHER_DISCOUNT_ID));

    expect(replica.discount(DISCOUNT_ID)).toMatchObject({ name: "Una", removed: false });
    expect(replica.discount(OTHER_DISCOUNT_ID)).toMatchObject({ name: "Otra", removed: true });
  });

  it("keeps the discounts when the register adopts another installation", async () => {
    await save(discountChange(1, discountRow({ version: 2 })));

    replica.adoptDevice({ deviceId: "device-b", pepper: PEPPER });

    expect(replica.discount(DISCOUNT_ID)).toMatchObject({ removed: false, version: 2 });
  });
});
