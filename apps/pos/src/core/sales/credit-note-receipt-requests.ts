import type { PrintCreditNoteOutcome } from "@purosur/contracts";
import { escPosCreditNoteTemplate } from "./receipt-printer/escpos-receipt-template";
import type { ReceiptRequestDeps } from "./receipt-requests";
import { readCreditNoteReceipt } from "./sqlite-credit-note-receipt";

type Unprinted = Extract<PrintCreditNoteOutcome, { kind: "not_found" | "printer_not_configured" }>;

function jobOf(saleId: string): string {
  return `credit-note:${saleId}`;
}

function start(
  { database, printers, jobs }: ReceiptRequestDeps,
  saleId: string,
  unattended: boolean,
) {
  return jobs.start(
    jobOf(saleId),
    async (runner): Promise<Unprinted | { kind: "printed" }> => {
      const content = readCreditNoteReceipt(database, saleId);
      if (content === null) {
        return { kind: "not_found" };
      }
      const printer = runner.printers(printers).configured();
      if (printer === undefined) {
        return { kind: "printer_not_configured" };
      }
      await printer.print(runner.watch, () => escPosCreditNoteTemplate.render(content));
      return { kind: "printed" };
    },
    { unattended },
  );
}

export async function printCreditNoteFor(
  deps: ReceiptRequestDeps,
  saleId: string,
): Promise<PrintCreditNoteOutcome> {
  const guarded = await deps.gate.run({ kind: "view_sales_history" }, async () => undefined);
  if (guarded.kind !== "performed") {
    return guarded;
  }
  const started = await start(deps, saleId, false);
  switch (started.kind) {
    case "busy":
      return { kind: "busy" };
    case "failed":
      return { kind: "unavailable" };
    case "sent":
      return { kind: "started" };
    case "answered":
      return started.outcome.kind === "printed" ? { kind: "started" } : started.outcome;
  }
}

export async function printVoidedSaleCreditNoteFor(
  deps: ReceiptRequestDeps,
  saleId: string,
): Promise<void> {
  await start(deps, saleId, true);
}
