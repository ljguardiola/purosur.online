import type { Scale, ScaleReading } from "@purosur/domain/stock/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { openCashSessionFor } from "../register/cash-session-requests";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { SqliteLocalReplica } from "../sync/sqlite-local-replica";
import { savePulledChanges } from "../sync/test-support/sqlite-local-replica";
import {
  findCountableProductFor,
  type InitialCountRequestDeps,
  readInitialCountFor,
  recordInitialCountLineFor,
  searchCountableProductsFor,
  weighCountedProductFor,
  withdrawInitialCountLineFor,
} from "./initial-count-requests";

const CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const NOW = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

let idCount: number;

function deps(overrides: Partial<InitialCountRequestDeps> = {}): InitialCountRequestDeps {
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => undefined,
      hashPin: async () => "",
      now: () => NOW,
    }),
    readOutboxChainKey: async () => CHAIN_KEY,
    now: () => NOW,
    ids: {
      next: () => {
        idCount += 1;
        return `id-${idCount}`;
      },
    },
    ...overrides,
  };
}

function addRole(id: string, permissions: string[]): void {
  database
    .prepare("INSERT INTO roles (id, name, is_administrator, version) VALUES (?, ?, 0, 1)")
    .run(id, id);
  for (const key of permissions) {
    database
      .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
      .run(id, key);
  }
}

function addPerson(id: string, roleId: string): void {
  database
    .prepare(
      "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, 'Ada', ?, 's', 1, 1)",
    )
    .run(id, roleId);
}

function addProduct(id: string, name: string, unit: string, code?: string): void {
  database
    .prepare(
      "INSERT INTO products (id, name, category_id, sale_unit, active, version, removed) VALUES (?, ?, 'c', ?, 1, 1, 0)",
    )
    .run(id, name, unit);
  if (code !== undefined) {
    database
      .prepare(
        "INSERT INTO product_barcodes (product_id, position, code, active) VALUES (?, 1, ?, 1)",
      )
      .run(id, code);
  }
}

function lines() {
  return database
    .prepare(
      "SELECT id, product_id, kind, delta, expires_on, withdraws_movement_id FROM stock_movements ORDER BY rowid",
    )
    .all();
}

function balances() {
  return database
    .prepare("SELECT product_id, quantity FROM stock_balances ORDER BY product_id")
    .all();
}

function outboxTypes() {
  return database.prepare("SELECT event_type FROM outbox ORDER BY device_seq").all();
}

function record(productId = "p1", counted = 6000, expiresOn: string | null = null) {
  return recordInitialCountLineFor(deps(), { productId, counted, expiresOn });
}

beforeEach(() => {
  idCount = 0;
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  addRole("counter", ["record_initial_inventory", "sell_and_charge"]);
  addRole("cashier", ["sell_and_charge"]);
  addPerson("u1", "counter");
  addPerson("u2", "cashier");
  addProduct("p1", "Yerba", "UNIT", "7790001");
  addProduct("p2", "Queso", "KG");
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1)")
    .run();
  database.prepare("UPDATE sync_state SET device_id = 'device-1'").run();
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
});

afterEach(() => {
  database.close();
});

describe("recording a line of the initial count on the register", () => {
  it("answers the line, keeps its movement and balance and appends the event to push", async () => {
    expect(await record("p1", 6000, "2026-12-31")).toEqual({
      kind: "recorded",
      line: {
        movement_id: "id-1",
        product_id: "p1",
        product_name: "Yerba",
        sale_unit: "UNIT",
        counted: 6000,
        expires_on: "2026-12-31",
      },
    });
    expect(lines()).toEqual([
      {
        id: "id-1",
        product_id: "p1",
        kind: "opening_count",
        delta: 6000,
        expires_on: "2026-12-31",
        withdraws_movement_id: null,
      },
    ]);
    expect(balances()).toEqual([{ product_id: "p1", quantity: 6000 }]);
    expect(outboxTypes()).toEqual([{ event_type: "opening_count_recorded" }]);
  });

  it.each([
    ["a product that does not exist", "other", 6000, null, { kind: "unknown_product" }],
    [
      "a fractional count of a product sold by the unit",
      "p1",
      1500,
      null,
      { kind: "invalid_quantity" },
    ],
    ["an expiry that is not a calendar day", "p1", 6000, "2026-02-30", { kind: "invalid_expiry" }],
  ])(
    "answers the domain's refusal of %s",
    async (_case, productId, counted, expiresOn, expected) => {
      expect(await record(productId, counted, expiresOn)).toEqual(expected);
      expect(lines()).toEqual([]);
    },
  );

  it("answers unavailable, recording nothing, without the outbox chain key", async () => {
    const outcome = await recordInitialCountLineFor(
      deps({ readOutboxChainKey: async () => undefined }),
      {
        productId: "p1",
        counted: 6000,
        expiresOn: null,
      },
    );

    expect(outcome).toEqual({ kind: "unavailable" });
    expect(lines()).toEqual([]);
  });

  it("answers not permitted to a person without the permission to count", async () => {
    signedInPerson.set("u2");

    expect(await record()).toEqual({ kind: "not_permitted" });
    expect(lines()).toEqual([]);
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await record()).toEqual({ kind: "not_signed_in" });
  });
});

describe("reading the initial count on the register", () => {
  it("answers that it is offered with no lines before any is counted", async () => {
    expect(await readInitialCountFor(deps())).toEqual({ kind: "read", offered: true, lines: [] });
  });

  it("answers the lines counted, in the order they were confirmed", async () => {
    await record("p1", 6000, "2026-12-31");
    await record("p2", 1500);

    expect(await readInitialCountFor(deps())).toEqual({
      kind: "read",
      offered: true,
      lines: [
        {
          movement_id: "id-1",
          product_id: "p1",
          product_name: "Yerba",
          sale_unit: "UNIT",
          counted: 6000,
          expires_on: "2026-12-31",
        },
        {
          movement_id: "id-3",
          product_id: "p2",
          product_name: "Queso",
          sale_unit: "KG",
          counted: 1500,
          expires_on: null,
        },
      ],
    });
  });

  it("answers not permitted to a person without the permission to count", async () => {
    signedInPerson.set("u2");

    expect(await readInitialCountFor(deps())).toEqual({ kind: "not_permitted" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await readInitialCountFor(deps())).toEqual({ kind: "not_signed_in" });
  });
});

describe("withdrawing a line of the initial count on the register", () => {
  it("withdraws it, leaving no line and the balance back, and appends the event to push", async () => {
    const recorded = await record("p1", 6000);
    if (recorded.kind !== "recorded") {
      throw new Error("test setup: the line was not recorded");
    }

    const outcome = await withdrawInitialCountLineFor(deps(), recorded.line.movement_id);

    expect(outcome).toEqual({ kind: "withdrawn" });
    expect(await readInitialCountFor(deps())).toEqual({ kind: "read", offered: true, lines: [] });
    expect(balances()).toEqual([{ product_id: "p1", quantity: 0 }]);
    expect(outboxTypes()).toEqual([
      { event_type: "opening_count_recorded" },
      { event_type: "opening_count_withdrawn" },
    ]);
  });

  it("answers the domain's refusal of a line that does not exist or was already withdrawn", async () => {
    const recorded = await record("p1", 6000);
    if (recorded.kind !== "recorded") {
      throw new Error("test setup: the line was not recorded");
    }
    await withdrawInitialCountLineFor(deps(), recorded.line.movement_id);

    expect(await withdrawInitialCountLineFor(deps(), recorded.line.movement_id)).toEqual({
      kind: "already_withdrawn",
    });
    expect(await withdrawInitialCountLineFor(deps(), "other")).toEqual({ kind: "not_found" });
  });

  it("answers unavailable without the outbox chain key", async () => {
    expect(
      await withdrawInitialCountLineFor(deps({ readOutboxChainKey: async () => undefined }), "any"),
    ).toEqual({ kind: "unavailable" });
  });

  it("answers not permitted to a person without the permission to count", async () => {
    signedInPerson.set("u2");

    expect(await withdrawInitialCountLineFor(deps(), "any")).toEqual({ kind: "not_permitted" });
  });

  it("answers not signed in when nobody is signed in", async () => {
    signedInPerson.clear();

    expect(await withdrawInitialCountLineFor(deps(), "any")).toEqual({ kind: "not_signed_in" });
  });
});

describe("finding a product to count", () => {
  it("answers the product with the barcode scanned", async () => {
    expect(await findCountableProductFor(deps(), "7790001")).toEqual({
      kind: "found",
      product: { product_id: "p1", name: "Yerba", sale_unit: "UNIT" },
    });
  });

  it("answers that the code is unknown", async () => {
    expect(await findCountableProductFor(deps(), "0000")).toEqual({ kind: "unknown_code" });
  });

  it("searches the products by name", async () => {
    expect(await searchCountableProductsFor(deps(), "quesito")).toEqual({
      kind: "results",
      products: [],
      more: false,
    });
    expect(await searchCountableProductsFor(deps(), "ques")).toEqual({
      kind: "results",
      products: [
        {
          product_id: "p2",
          name: "Queso",
          sale_unit: "KG",
          matches: [{ start: 0, length: 4 }],
        },
      ],
      more: false,
    });
  });

  it.each([
    ["u2", { kind: "not_permitted" }],
    [null, { kind: "not_signed_in" }],
  ])("answers the refusal of who is signed in as %s", async (person, expected) => {
    if (person === null) {
      signedInPerson.clear();
    } else {
      signedInPerson.set(person);
    }

    expect(await findCountableProductFor(deps(), "7790001")).toEqual(expected);
    expect(await searchCountableProductsFor(deps(), "yer")).toEqual(expected);
  });
});

describe("weighing a product to count on the scale", () => {
  function weigh(reading: ScaleReading, productId = "p2") {
    const scale: Scale = { read: async () => reading };
    return weighCountedProductFor({ ...deps(), scale }, productId);
  }

  it("answers the weight of a stable reading", async () => {
    expect(await weigh({ kind: "stable", weightThousandths: 1250 })).toEqual({
      kind: "weighed",
      weight_thousandths: 1250,
    });
  });

  it.each([
    ["a reading that is not stable", { kind: "not_stable" } as const, "p2", { kind: "weighing" }],
    [
      "a scale that is unavailable",
      { kind: "unavailable" } as const,
      "p2",
      { kind: "scale_unavailable" },
    ],
    [
      "a product sold by the unit",
      { kind: "stable", weightThousandths: 1000 } as const,
      "p1",
      { kind: "not_sold_by_weight" },
    ],
    [
      "a product that does not exist",
      { kind: "stable", weightThousandths: 1000 } as const,
      "other",
      { kind: "unknown_product" },
    ],
  ])("answers the domain's outcome for %s", async (_case, reading, productId, expected) => {
    expect(await weigh(reading, productId)).toEqual(expected);
  });

  it.each([
    ["u2", { kind: "not_permitted" }],
    [null, { kind: "not_signed_in" }],
  ])(
    "answers the refusal of who is signed in as %s, without reading the scale",
    async (person, expected) => {
      let reads = 0;
      if (person === null) {
        signedInPerson.clear();
      } else {
        signedInPerson.set(person);
      }

      const outcome = await weighCountedProductFor(
        {
          ...deps(),
          scale: {
            read: async () => {
              reads += 1;
              return { kind: "stable", weightThousandths: 1000 };
            },
          },
        },
        "p2",
      );

      expect(outcome).toEqual(expected);
      expect(reads).toBe(0);
    },
  );
});

describe("the retirement of the initial count", () => {
  it("stops being offered the moment the register opens its first cash session", async () => {
    await record("p1", 6000);
    expect(await readInitialCountFor(deps())).toMatchObject({ offered: true });

    expect((await openCashSessionFor(deps(), 5000)).kind).toBe("opened");

    expect(await readInitialCountFor(deps())).toMatchObject({ kind: "read", offered: false });
    expect(await record("p1", 1000)).toEqual({ kind: "not_offered" });
    expect(await findCountableProductFor(deps(), "7790001")).toEqual({ kind: "not_offered" });
  });

  it("stops being offered once the cloud says another register of the branch opened a session", async () => {
    const replica = new SqliteLocalReplica(database);
    await savePulledChanges(replica, {
      changeSeq: 1,
      change: {
        change_seq: 1,
        entity: "branch_first_cash_session",
        entity_id: "location-1",
        row: { opened_at: "2026-09-29T12:00:00.000Z" },
      },
    });

    expect(await readInitialCountFor(deps())).toMatchObject({ kind: "read", offered: false });
    expect(await record("p1", 1000)).toEqual({ kind: "not_offered" });
  });
});
