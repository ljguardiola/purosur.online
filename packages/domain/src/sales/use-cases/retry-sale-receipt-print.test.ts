import { describe, expect, it } from "vitest";
import type { ReceiptPrintStanding } from "../model/receipt-print-standing.js";
import type { ReceiptPrintGrant } from "./receipt-printing.js";
import { retrySaleReceiptPrint } from "./retry-sale-receipt-print.js";
import { FakeOperationAuthority } from "./test-support/fake-operation-authority.js";
import { textOf } from "./test-support/fake-receipt-template.js";
import {
  ACKNOWLEDGED_AT,
  completedSale,
  FIRST_PRINT_AT,
  NOT_PERMITTED,
  receiptRig,
} from "./test-support/receipt-rig.js";

function standingsOf(standing: ReceiptPrintStanding | null) {
  const asked: string[] = [];
  return {
    asked,
    standingOf: (saleId: string) => {
      asked.push(saleId);
      return standing;
    },
  };
}

const attempted = completedSale({ printAttemptedAt: FIRST_PRINT_AT });

describe("retrySaleReceiptPrint", () => {
  it("prints the retry the print stands offered, as a duplicate recorded as a retry", async () => {
    const rig = receiptRig([attempted]);
    rig.clock.set(ACKNOWLEDGED_AT);
    const standings = standingsOf("retry_offered");

    const printing = retrySaleReceiptPrint(
      { ...rig.ports, standings },
      { saleId: "sale-1" },
      rig.watch,
    );
    await rig.printer.whenSent();
    rig.printer.acknowledge();

    expect(await printing).toEqual({
      kind: "printed",
      copy: { kind: "duplicate", orderNumber: 1 },
    });
    expect(standings.asked).toEqual(["sale-1"]);
    expect(rig.ledger.state.sales[0]?.reprints[0]?.reason).toEqual({ kind: "retry" });
    expect(textOf(rig.printer.sent[0]?.bytes ?? new Uint8Array())).toBe(
      "HEAD[v1] total 6750\nDUPLICATE 1\nBODY 1 lines\n",
    );
  });

  it.each([
    null,
    "printing",
    "printed",
    "cover_open",
    "paper_out",
    "not_responding",
    "failed",
  ] as const)(
    "answers not_offered and records and sends nothing when the print stands as %s",
    async (standing) => {
      const rig = receiptRig([attempted]);

      const outcome = await retrySaleReceiptPrint(
        { ...rig.ports, standings: standingsOf(standing) },
        { saleId: "sale-1" },
        rig.watch,
      );

      expect(outcome).toEqual({ kind: "not_offered" });
      expect(rig.ledger.transactions).toBe(0);
      expect(rig.printer.sent).toEqual([]);
    },
  );

  it("returns the authority's refusal before asking how the print stands", async () => {
    const refusing = new FakeOperationAuthority<ReceiptPrintGrant, typeof NOT_PERMITTED>({
      kind: "refused",
      refusal: NOT_PERMITTED,
    });
    const rig = receiptRig([attempted], refusing);
    const standings = standingsOf("retry_offered");

    const outcome = await retrySaleReceiptPrint(
      { ...rig.ports, standings },
      { saleId: "sale-1" },
      rig.watch,
    );

    expect(outcome).toEqual(NOT_PERMITTED);
    expect(standings.asked).toEqual([]);
    expect(rig.ledger.transactions).toBe(0);
  });
});
