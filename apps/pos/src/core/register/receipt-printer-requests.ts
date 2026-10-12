import {
  type ReadReceiptPrinterOutcome,
  receiptPrinterAddressTextSchema,
  type SetReceiptPrinterOutcome,
} from "@purosur/contracts";
import {
  type ReceiptPrinterReplacement,
  readReceiptPrinterAddress,
  setReceiptPrinterAddress,
} from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate, SignedInActor } from "../sessions/action-gate";
import { SqliteReceiptPrinterSettings } from "./sqlite-receipt-printer-settings";

export interface ReceiptPrinterRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  replacement: ReceiptPrinterReplacement;
}

type Refusal = { kind: "not_signed_in" } | { kind: "lacks_permission" };

function authorityOf(gate: ActionGate) {
  return {
    async authorize() {
      const guarded = await gate.run(
        { kind: "configure_receipt_printer" },
        async (actor): Promise<SignedInActor> => actor,
      );
      return guarded.kind === "performed"
        ? ({ kind: "granted", grant: guarded.result } as const)
        : ({ kind: "refused", refusal: guarded satisfies Refusal } as const);
    },
  };
}

export async function readReceiptPrinterFor({
  database,
  gate,
}: Pick<ReceiptPrinterRequestDeps, "database" | "gate">): Promise<ReadReceiptPrinterOutcome> {
  return readReceiptPrinterAddress({
    settings: new SqliteReceiptPrinterSettings(database),
    authority: authorityOf(gate),
  });
}

export async function setReceiptPrinterFor(
  { database, gate, replacement }: ReceiptPrinterRequestDeps,
  text: string,
): Promise<SetReceiptPrinterOutcome> {
  const parsed = receiptPrinterAddressTextSchema.safeParse(text);
  if (!parsed.success) {
    return { kind: "invalid_address" };
  }
  return setReceiptPrinterAddress(
    {
      settings: new SqliteReceiptPrinterSettings(database),
      authority: authorityOf(gate),
      replacement,
    },
    { address: parsed.data },
  );
}
