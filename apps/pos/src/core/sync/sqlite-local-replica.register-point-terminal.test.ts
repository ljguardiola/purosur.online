import type { SyncChange } from "@purosur/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import type { RegisterPulledChange } from "./pulled-change";
import type { SqliteLocalReplica } from "./sqlite-local-replica";
import {
  openAdoptedReplica,
  savePulledChanges,
  TEST_PEPPER,
} from "./test-support/sqlite-local-replica";

const REGISTER_ID = "4b0e6dc3-85f7-4a4b-8c9d-1e3f5a7b9c04";

function terminalChange(
  changeSeq: number,
  assigned: boolean,
  version: number,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "register_point_terminal",
    entity_id: REGISTER_ID,
    row: { assigned, version },
  };
  return { changeSeq, change };
}

function save(...changes: RegisterPulledChange[]) {
  return savePulledChanges(replica, ...changes);
}

function savedAssignments() {
  return database
    .prepare("SELECT register_id, assigned, version FROM register_point_terminal")
    .all();
}

let database: LocalDatabase;
let replica: SqliteLocalReplica;

beforeEach(() => {
  ({ database, replica } = openAdoptedReplica());
});

afterEach(() => {
  database.close();
});

describe("the register's local copy of whether it has a Point terminal assigned", () => {
  it("holds none before it is pulled", () => {
    expect(savedAssignments()).toEqual([]);
  });

  it("saves that a terminal is assigned", async () => {
    await save(terminalChange(1, true, 1));

    expect(savedAssignments()).toEqual([{ register_id: REGISTER_ID, assigned: 1, version: 1 }]);
  });

  it("takes a newer version that withdraws the assignment", async () => {
    await save(terminalChange(1, true, 1));

    await save(terminalChange(2, false, 2));

    expect(savedAssignments()).toEqual([{ register_id: REGISTER_ID, assigned: 0, version: 2 }]);
  });

  it("keeps it when the same or an older version arrives late", async () => {
    await save(terminalChange(1, false, 3));

    await save(terminalChange(2, true, 2), terminalChange(3, true, 3));

    expect(savedAssignments()).toEqual([{ register_id: REGISTER_ID, assigned: 0, version: 3 }]);
  });

  it("keeps the newest of versions delivered out of order in one page", async () => {
    await save(
      terminalChange(1, true, 3),
      terminalChange(2, false, 1),
      terminalChange(3, false, 2),
    );

    expect(savedAssignments()).toEqual([{ register_id: REGISTER_ID, assigned: 1, version: 3 }]);
  });

  it("holds none once another installation takes over, until that one pulls its own", async () => {
    await save(terminalChange(1, true, 4));

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });
    expect(savedAssignments()).toEqual([]);
    await save(terminalChange(1, true, 1));

    expect(savedAssignments()).toEqual([{ register_id: REGISTER_ID, assigned: 1, version: 1 }]);
  });

  it("keeps it for the installation that pulled it", async () => {
    await save(terminalChange(1, true, 1));

    replica.adoptDevice({ deviceId: "device-a", pepper: TEST_PEPPER });

    expect(savedAssignments()).toHaveLength(1);
  });
});
