import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  READABLE_EVENT_VERSIONS,
  saleReturnedEventCreditNoteSchema,
  saleVoidedEventCreditNoteSchema,
} from "@purosur/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { emittedEventVersions } from "./register-event-versions.js";

const REPO_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const MODULE = fileURLToPath(new URL("./register-event-versions.ts", import.meta.url));

describe("the event versions a checkout's register emits", { timeout: 0 }, () => {
  let emitted: string[];

  beforeAll(() => {
    emitted = emittedEventVersions(REPO_DIR);
  }, 0);

  it("are written event_type@schema_version, sorted, each once", () => {
    expect(emitted).toContain("sale_completed@10");
    expect(emitted.every((version) => /^[a-z_]+@[1-9]\d*$/.test(version))).toBe(true);
    expect(emitted).toEqual([...new Set(emitted)].sort());
  });

  it("are all versions the cloud reads", () => {
    expect(emitted.filter((version) => !READABLE_EVENT_VERSIONS.includes(version))).toEqual([]);
  });

  it("of a void or a return are all versions the cloud reads a credit note request with", () => {
    const creditNote = {
      id: "0199b7a0-0000-7000-8000-000000000003",
      total: 3_000,
      receiver_tax_status_code: 5,
      corrects: { voucher_type: 11, point_of_sale: 8, number: 77 },
      issued_on: "2026-10-01",
    };
    const requestOf = {
      sale_voided: (schemaVersion: number) =>
        saleVoidedEventCreditNoteSchema.safeParse({
          event_type: "sale_voided",
          schema_version: schemaVersion,
          aggregate_id: "sale-1",
          payload: { credit_note: creditNote },
        }).success,
      sale_returned: (schemaVersion: number) =>
        saleReturnedEventCreditNoteSchema.safeParse({
          event_type: "sale_returned",
          schema_version: schemaVersion,
          aggregate_id: "return-1",
          payload: { id: "return-1", sale_id: "sale-1", credit_note: creditNote },
        }).success,
    };
    const asking = emitted.flatMap((version) => {
      const [eventType, schemaVersion] = version.split("@");
      return eventType === "sale_voided" || eventType === "sale_returned"
        ? [{ version, read: requestOf[eventType](Number(schemaVersion)) }]
        : [];
    });

    expect(asking.map(({ version }) => version.split("@")[0])).toEqual(
      expect.arrayContaining(["sale_voided", "sale_returned"]),
    );
    expect(asking.filter(({ read }) => !read).map(({ version }) => version)).toEqual([]);
  });

  it("are printed as a JSON array by running the module on a checkout's root", () => {
    const printed = execFileSync(process.execPath, [MODULE, REPO_DIR], { encoding: "utf8" });

    expect(JSON.parse(printed)).toEqual(emitted);
  });
});
