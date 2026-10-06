import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import type { RegisterPulledChange } from "./pulled-change";
import { SqliteLocalReplica } from "./sqlite-local-replica";

const REGISTER_ID = "4b0e6dc3-85f7-4a4b-8c9d-1e3f5a7b9c04";
const PEPPER = Buffer.alloc(32, 7).toString("base64url");

function registerChange(changeSeq: number, name: string, version: number): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "register",
    entity_id: REGISTER_ID,
    row: { name, version },
  };
  return { changeSeq, change };
}

function registerRemoval(changeSeq: number, version: number): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "removal",
    entity_id: REGISTER_ID,
    removed_entity: "register",
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
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  replica = new SqliteLocalReplica(database);
  replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });
});

afterEach(() => {
  database.close();
});

describe("the register's local copy of its own row", () => {
  it("has no name before the register's row is pulled", () => {
    expect(replica.registerName()).toBeUndefined();
  });

  it("saves the register's name", async () => {
    await save(registerChange(1, "Caja 1", 1));

    expect(replica.registerName()).toBe("Caja 1");
  });

  it("replaces the name with a newer version", async () => {
    await save(registerChange(1, "Caja 1", 1));

    await save(registerChange(2, "Caja principal", 2));

    expect(replica.registerName()).toBe("Caja principal");
  });

  it("keeps the name when the same or an older version arrives late", async () => {
    await save(registerChange(1, "Caja principal", 3));

    await save(registerChange(2, "Caja vieja", 2), registerChange(3, "Otra", 3));

    expect(replica.registerName()).toBe("Caja principal");
  });

  it("holds no name once the register is removed", async () => {
    await save(registerChange(1, "Caja 1", 1));

    await save(registerRemoval(2, 2));

    expect(replica.registerName()).toBeUndefined();
  });

  it("does not let a removal of an older version take the name away", async () => {
    await save(registerChange(1, "Caja 1", 3));

    await save(registerRemoval(2, 2));

    expect(replica.registerName()).toBe("Caja 1");
  });

  it("does not let an older version bring back a removed register", async () => {
    await save(registerChange(1, "Caja 1", 1), registerRemoval(2, 2));

    await save(registerChange(3, "Caja 1", 1));

    expect(replica.registerName()).toBeUndefined();
  });

  it("holds no name once another installation takes over, until that one pulls its own", async () => {
    await save(registerChange(1, "Caja 1", 4));

    replica.adoptDevice({ deviceId: "device-b", pepper: PEPPER });
    expect(replica.registerName()).toBeUndefined();
    await save(registerChange(1, "Caja 2", 1));

    expect(replica.registerName()).toBe("Caja 2");
  });

  it("keeps the name for the installation that pulled it", async () => {
    await save(registerChange(1, "Caja 1", 1));

    replica.adoptDevice({ deviceId: "device-a", pepper: PEPPER });

    expect(replica.registerName()).toBe("Caja 1");
  });
});
