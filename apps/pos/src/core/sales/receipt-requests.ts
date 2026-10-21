import type {
  Authorization,
  PrintOriginalReceiptOutcome,
  ReceiptPrintStatusOutcome,
  ReprintSaleReceiptOutcome,
} from "@purosur/contracts";
import type { PrintedDocumentKey, ReceiptCopy } from "@purosur/domain";
import {
  type Clock,
  type IdGenerator,
  type OperationAuthority,
  type OperationAuthorization,
  printOriginalReceipt,
  printSaleReceipt,
  type ReceiptPrinters,
  type ReceiptPrintGrant,
  readSaleComprobante,
  receiptDeliveryOf,
  reprintSaleReceipt,
} from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import type { ReceiptPrintJobs } from "./receipt-print-jobs";
import { escPosReceiptTemplate } from "./receipt-printer/escpos-receipt-template";
import { toWireComprobante } from "./sales-history-requests";
import { SqliteReceiptLedger } from "./sqlite-receipt-ledger";
import { SqliteRegisterSalesHistory } from "./sqlite-register-sales-history";
import { toWireCopy } from "./wire-receipt-copy";

export interface ReceiptRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  now: Clock["now"];
  ids: IdGenerator;
  readOutboxChainKey: () => Promise<string | undefined>;
  signedInUserId: () => string | undefined;
  printers: ReceiptPrinters;
  jobs: ReceiptPrintJobs;
}

export interface ReprintSaleReceiptRequest {
  saleId: string;
  reason: string;
  authorization?: Authorization | undefined;
}

type SaleReceiptRefusal = Extract<
  ReprintSaleReceiptOutcome,
  {
    kind:
      | "not_signed_in"
      | "lacks_permission"
      | "wrong_pin"
      | "rate_limited"
      | "locked"
      | "unavailable";
  }
>;

type SellerRefusal = Extract<
  ReprintSaleReceiptOutcome,
  { kind: "not_signed_in" | "lacks_permission" }
>;

function jobKeyOf({ document, saleId }: PrintedDocumentKey): string {
  return document === "credit_note" ? `credit-note:${saleId}` : saleId;
}

export async function receiptPrintStatusFor(
  { database, signedInUserId, jobs }: ReceiptRequestDeps,
  saleId: string,
): Promise<ReceiptPrintStatusOutcome> {
  if (signedInUserId() === undefined) {
    return { kind: "not_signed_in" };
  }
  const delivery = receiptDeliveryOf(
    { ledger: new SqliteReceiptLedger(database) },
    { document: "sale_receipt", saleId },
  );
  return delivery.kind === "not_found"
    ? delivery
    : {
        kind: "found",
        next_copy: toWireCopy(delivery.nextCopy),
        printed: delivery.printedAt !== null,
        standing: jobs.standingOf(saleId),
        comprobante: toWireComprobante(
          readSaleComprobante({ history: new SqliteRegisterSalesHistory(database) }, { saleId }),
        ),
      };
}

interface Started {
  copy: ReceiptCopy | undefined;
}

function printingPorts<Refusal>(
  deps: ReceiptRequestDeps,
  chainKey: string | undefined,
  authority: OperationAuthority<ReceiptPrintGrant, Refusal>,
  printers: ReceiptPrinters,
) {
  return {
    ledger: new SqliteReceiptLedger(deps.database, chainKey),
    clock: { now: deps.now },
    ids: deps.ids,
    template: escPosReceiptTemplate,
    printers,
    authority,
  };
}

function copyAfterGrant(deps: ReceiptRequestDeps, key: PrintedDocumentKey, started: Started): void {
  const delivery = receiptDeliveryOf({ ledger: new SqliteReceiptLedger(deps.database) }, key);
  started.copy = delivery.kind === "found" ? delivery.nextCopy : undefined;
}

function signedSellerAuthority(
  deps: ReceiptRequestDeps,
  onGrant: () => void,
): OperationAuthority<ReceiptPrintGrant, SellerRefusal> {
  return {
    async authorize(): Promise<OperationAuthorization<ReceiptPrintGrant, SellerRefusal>> {
      const guarded = await deps.gate.run({ kind: "sell" }, async (actor) => actor);
      if (guarded.kind !== "performed") {
        return { kind: "refused", refusal: guarded };
      }
      onGrant();
      return {
        kind: "granted",
        grant: { actorId: guarded.result.signedInUserId, authorizedBy: undefined },
      };
    },
  };
}

export async function printCompletedSaleReceiptFor(
  deps: ReceiptRequestDeps,
  saleId: string,
): Promise<void> {
  const key = { document: "sale_receipt", saleId } as const;
  const chainKey = await deps.readOutboxChainKey();
  await deps.jobs.start(
    jobKeyOf(key),
    ({ watch, printers }) =>
      printSaleReceipt(
        printingPorts(
          deps,
          chainKey,
          signedSellerAuthority(deps, () => {}),
          printers(deps.printers),
        ),
        key,
        watch,
      ),
    { unattended: true },
  );
}

export async function printOriginalFor<Refusal extends PrintOriginalReceiptOutcome>(
  deps: ReceiptRequestDeps,
  key: PrintedDocumentKey,
  authority: (onGrant: () => void) => OperationAuthority<ReceiptPrintGrant, Refusal>,
  options?: { unattended: boolean },
): Promise<PrintOriginalReceiptOutcome> {
  const chainKey = await deps.readOutboxChainKey();
  const started: Started = { copy: undefined };
  const start = await deps.jobs.start(
    jobKeyOf(key),
    ({ watch, printers }) =>
      printOriginalReceipt(
        printingPorts(
          deps,
          chainKey,
          authority(() => copyAfterGrant(deps, key, started)),
          printers(deps.printers),
        ),
        key,
        watch,
      ),
    options,
  );
  switch (start.kind) {
    case "busy":
      return { kind: "busy" };
    case "failed":
      return { kind: "unavailable" };
    case "sent":
      return started.copy === undefined
        ? { kind: "unavailable" }
        : { kind: "started", copy: toWireCopy(started.copy) };
    case "answered": {
      const { outcome } = start;
      return outcome.kind === "printed" || outcome.kind === "abandoned"
        ? { kind: "started", copy: toWireCopy(outcome.copy) }
        : outcome;
    }
  }
}

export async function printOriginalReceiptFor(
  deps: ReceiptRequestDeps,
  saleId: string,
): Promise<PrintOriginalReceiptOutcome> {
  return printOriginalFor(deps, { document: "sale_receipt", saleId }, (onGrant) =>
    signedSellerAuthority(deps, onGrant),
  );
}

export async function reprintFor(
  deps: ReceiptRequestDeps,
  key: PrintedDocumentKey,
  { reason, authorization }: Omit<ReprintSaleReceiptRequest, "saleId">,
): Promise<ReprintSaleReceiptOutcome> {
  const chainKey = await deps.readOutboxChainKey();
  const started: Started = { copy: undefined };
  const authority: OperationAuthority<ReceiptPrintGrant, SaleReceiptRefusal> = {
    async authorize() {
      const guarded = await deps.gate.runAuthorized(
        { kind: "reprint_receipt" },
        authorization,
        async (actor) => actor,
      );
      if (guarded.kind !== "performed") {
        return { kind: "refused", refusal: guarded };
      }
      copyAfterGrant(deps, key, started);
      return {
        kind: "granted",
        grant: {
          actorId: guarded.result.signedInUserId,
          authorizedBy: guarded.authorized_by?.user_id,
        },
      };
    },
  };
  const start = await deps.jobs.start(jobKeyOf(key), ({ watch, printers }) =>
    reprintSaleReceipt(
      printingPorts(deps, chainKey, authority, printers(deps.printers)),
      { ...key, reason },
      watch,
    ),
  );
  switch (start.kind) {
    case "busy":
      return { kind: "busy" };
    case "failed":
      return { kind: "unavailable" };
    case "sent":
      return started.copy === undefined
        ? { kind: "unavailable" }
        : { kind: "started", copy: toWireCopy(started.copy) };
    case "answered": {
      const { outcome } = start;
      if (outcome.kind === "printed" || outcome.kind === "abandoned") {
        return { kind: "started", copy: toWireCopy(outcome.copy) };
      }
      return outcome.kind === "invalid_reason"
        ? { kind: "invalid_reason", max_length: outcome.maxLength }
        : outcome;
    }
  }
}

export async function reprintSaleReceiptFor(
  deps: ReceiptRequestDeps,
  { saleId, ...request }: ReprintSaleReceiptRequest,
): Promise<ReprintSaleReceiptOutcome> {
  return reprintFor(deps, { document: "sale_receipt", saleId }, request);
}
