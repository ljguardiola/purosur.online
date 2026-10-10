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

const BLOCK_ID = "9d1f0c52-3a5e-4f7b-8c61-2b7e4a9d0e13";
const SECOND_BLOCK_ID = "5e2a7c91-0b4d-4e68-9f13-7a6c8d2b1e40";

function codeChange(
  changeSeq: number,
  code: string,
  version: number,
  fortnightStart = "2026-10-01",
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "offline_authorization_code",
    entity_id: fortnightStart,
    row: {
      fortnight_start: fortnightStart,
      fortnight_end: "2026-10-15",
      code,
      report_deadline: "2026-10-20",
      version,
    },
  };
  return { changeSeq, change };
}

function blockChange(
  changeSeq: number,
  firstNumber: number,
  lastNumber: number,
  version: number,
  id = BLOCK_ID,
): RegisterPulledChange {
  const change: SyncChange = {
    change_seq: changeSeq,
    entity: "offline_number_block",
    entity_id: id,
    row: {
      point_of_sale_number: 31,
      document_type: "factura_c",
      first_number: firstNumber,
      last_number: lastNumber,
      status: "in_use",
      version,
    },
  };
  return { changeSeq, change };
}

function save(...changes: RegisterPulledChange[]) {
  return savePulledChanges(replica, ...changes);
}

function savedCodes() {
  return database
    .prepare<
      [],
      {
        fortnight_start: string;
        fortnight_end: string;
        code: string;
        report_deadline: string;
        version: number;
      }
    >(
      `SELECT fortnight_start, fortnight_end, code, report_deadline, version
       FROM offline_authorization_codes ORDER BY fortnight_start`,
    )
    .all();
}

function savedBlocks() {
  return database
    .prepare<
      [],
      {
        id: string;
        point_of_sale: number;
        document_type: string;
        first_number: number;
        last_number: number;
        status: string;
        version: number;
      }
    >(
      `SELECT id, point_of_sale, document_type, first_number, last_number, status, version
       FROM offline_number_blocks ORDER BY first_number`,
    )
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

describe("the register's local copy of its offline authorization codes", () => {
  it("holds the code with the fortnight it covers and its report deadline", async () => {
    await save(codeChange(1, "CAEA-A", 1));

    expect(savedCodes()).toEqual([
      {
        fortnight_start: "2026-10-01",
        fortnight_end: "2026-10-15",
        code: "CAEA-A",
        report_deadline: "2026-10-20",
        version: 1,
      },
    ]);
  });

  it("holds the codes of different fortnights side by side", async () => {
    await save(codeChange(1, "CAEA-A", 1), codeChange(2, "CAEA-B", 1, "2026-10-16"));

    expect(savedCodes().map((row) => row.code)).toEqual(["CAEA-A", "CAEA-B"]);
  });

  it("keeps a code when the same or an older version arrives late", async () => {
    await save(codeChange(1, "CAEA-A", 2));

    await save(codeChange(2, "CAEA-OLD", 1), codeChange(3, "CAEA-SAME", 2));

    expect(savedCodes().map((row) => row.code)).toEqual(["CAEA-A"]);
  });

  it("replaces a code with a newer version", async () => {
    await save(codeChange(1, "CAEA-A", 1));

    await save(codeChange(2, "CAEA-NEW", 2));

    expect(savedCodes().map((row) => row.code)).toEqual(["CAEA-NEW"]);
  });

  it("keeps the codes when another installation takes over, as it keeps the issuer's data", async () => {
    await save(codeChange(1, "CAEA-A", 1));

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });

    expect(savedCodes()).toHaveLength(1);
  });
});

describe("the register's local copy of its offline number blocks", () => {
  it("holds the block with its point of sale, range and status", async () => {
    await save(blockChange(1, 1, 1000, 1));

    expect(savedBlocks()).toEqual([
      {
        id: BLOCK_ID,
        point_of_sale: 31,
        document_type: "factura_c",
        first_number: 1,
        last_number: 1000,
        status: "in_use",
        version: 1,
      },
    ]);
  });

  it("holds several blocks of the same point of sale", async () => {
    await save(blockChange(1, 1, 1000, 1), blockChange(2, 1001, 2000, 1, SECOND_BLOCK_ID));

    expect(savedBlocks().map((row) => row.first_number)).toEqual([1, 1001]);
  });

  it("keeps a block when the same or an older version arrives late", async () => {
    await save(blockChange(1, 1, 1000, 2));

    await save(blockChange(2, 1, 500, 1), blockChange(3, 1, 700, 2));

    expect(savedBlocks().map((row) => row.last_number)).toEqual([1000]);
  });

  it("replaces a block with a newer version", async () => {
    await save(blockChange(1, 1, 1000, 1));

    await save(blockChange(2, 1, 1200, 2));

    expect(savedBlocks().map((row) => row.last_number)).toEqual([1200]);
  });

  it("holds none once another installation takes over, until that one pulls its own", async () => {
    await save(blockChange(1, 1, 1000, 1));

    replica.adoptDevice({ deviceId: "device-b", pepper: TEST_PEPPER });

    expect(savedBlocks()).toEqual([]);
    await save(blockChange(1, 1001, 2000, 1, SECOND_BLOCK_ID));
    expect(savedBlocks().map((row) => row.first_number)).toEqual([1001]);
  });

  it("keeps the blocks for the installation that pulled them", async () => {
    await save(blockChange(1, 1, 1000, 1));

    replica.adoptDevice({ deviceId: "device-a", pepper: TEST_PEPPER });

    expect(savedBlocks()).toHaveLength(1);
  });
});
