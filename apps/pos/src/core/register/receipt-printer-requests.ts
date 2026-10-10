import {
  type ReadReceiptPrinterOutcome,
  receiptPrinterAddressTextSchema,
  type SetReceiptPrinterOutcome,
} from "@purosur/contracts";
import {
  readReceiptPrinterAddress,
  setReceiptPrinterAddress,
} from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate, SignedInActor } from "../sessions/action-gate";
import { SqliteReceiptPrinterSettings } from "./sqlite-receipt-printer-settings";

export interface ReceiptPrinterRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
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
}: ReceiptPrinterRequestDeps): Promise<ReadReceiptPrinterOutcome> {
  return readReceiptPrinterAddress({
    settings: new SqliteReceiptPrinterSettings(database),
    authority: authorityOf(gate),
  });
}

export async function setReceiptPrinterFor(
  { database, gate }: ReceiptPrinterRequestDeps,
  text: string,
): Promise<SetReceiptPrinterOutcome> {
  const parsed = receiptPrinterAddressTextSchema.safeParse(text);
  if (!parsed.success) {
    return { kind: "invalid_address" };
  }
  return setReceiptPrinterAddress(
    { settings: new SqliteReceiptPrinterSettings(database), authority: authorityOf(gate) },
    { address: parsed.data },
  );
}
