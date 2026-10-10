import type {
  Authorization,
  ReceiptCopyShown,
  ReceiptPrintStatusOutcome,
  ReprintSaleReceiptOutcome,
  RetryReceiptPrintOutcome,
} from "@purosur/contracts";
import type { ReceiptCopy } from "@purosur/domain";
import {
  type Clock,
  type IdGenerator,
  type OperationAuthority,
  type OperationAuthorization,
  printSaleReceipt,
  type ReceiptPrinter,
  type ReceiptPrintGrant,
  receiptDeliveryOf,
  reprintSaleReceipt,
  retrySaleReceiptPrint,
} from "@purosur/domain/sales/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import type { ActionGate } from "../sessions/action-gate";
import { escPosReceiptTemplate } from "./escpos-receipt-template";
import type { ReceiptPrintJobs } from "./receipt-print-jobs";
import { SqliteReceiptLedger } from "./sqlite-receipt-ledger";

export interface ReceiptRequestDeps {
  database: LocalDatabase;
  gate: ActionGate;
  now: Clock["now"];
  ids: IdGenerator;
  readOutboxChainKey: () => Promise<string | undefined>;
  signedInUserId: () => string | undefined;
  printer: ReceiptPrinter;
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
  RetryReceiptPrintOutcome,
  { kind: "not_signed_in" | "lacks_permission" }
>;

function toWireCopy(copy: ReceiptCopy): ReceiptCopyShown {
  return copy.kind === "original" ? copy : { kind: "duplicate", order_number: copy.orderNumber };
}

export async function receiptPrintStatusFor(
  { database, signedInUserId, jobs }: ReceiptRequestDeps,
  saleId: string,
): Promise<ReceiptPrintStatusOutcome> {
  if (signedInUserId() === undefined) {
    return { kind: "not_signed_in" };
  }
  const delivery = receiptDeliveryOf({ ledger: new SqliteReceiptLedger(database) }, { saleId });
  return delivery.kind === "not_found"
    ? delivery
    : {
        kind: "found",
        next_copy: toWireCopy(delivery.nextCopy),
        printed: delivery.printedAt !== null,
        standing: jobs.standingOf(saleId),
      };
}

interface Started {
  copy: ReceiptCopy | undefined;
}

function printingPorts<Refusal>(
  deps: ReceiptRequestDeps,
  chainKey: string | undefined,
  authority: OperationAuthority<ReceiptPrintGrant, Refusal>,
  printer: ReceiptPrinter,
) {
  return {
    ledger: new SqliteReceiptLedger(deps.database, chainKey),
    clock: { now: deps.now },
    ids: deps.ids,
    template: escPosReceiptTemplate,
    printer,
    authority,
  };
}

function copyAfterGrant(deps: ReceiptRequestDeps, saleId: string, started: Started): void {
  const delivery = receiptDeliveryOf(
    { ledger: new SqliteReceiptLedger(deps.database) },
    { saleId },
  );
  started.copy = delivery.kind === "found" ? delivery.nextCopy : undefined;
}

function signedSellerAuthority(
  deps: ReceiptRequestDeps,
  saleId: string,
  started: Started,
): OperationAuthority<ReceiptPrintGrant, SellerRefusal> {
  return {
    async authorize(): Promise<OperationAuthorization<ReceiptPrintGrant, SellerRefusal>> {
      const guarded = await deps.gate.run({ kind: "sell" }, async (actor) => actor);
      if (guarded.kind !== "performed") {
        return { kind: "refused", refusal: guarded };
      }
      copyAfterGrant(deps, saleId, started);
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
  const chainKey = await deps.readOutboxChainKey();
  const started: Started = { copy: undefined };
  await deps.jobs.start(
    saleId,
    ({ watch, printer }) =>
      printSaleReceipt(
        printingPorts(
          deps,
          chainKey,
          signedSellerAuthority(deps, saleId, started),
          printer(deps.printer),
        ),
        { saleId },
        watch,
      ),
    { unattended: true },
  );
}

export async function retryReceiptPrintFor(
  deps: ReceiptRequestDeps,
  saleId: string,
): Promise<RetryReceiptPrintOutcome> {
  const chainKey = await deps.readOutboxChainKey();
  const started: Started = { copy: undefined };
  const start = await deps.jobs.start(saleId, ({ watch, printer }) =>
    retrySaleReceiptPrint(
      {
        ...printingPorts(
          deps,
          chainKey,
          signedSellerAuthority(deps, saleId, started),
          printer(deps.printer),
        ),
        standings: deps.jobs,
      },
      { saleId },
      watch,
    ),
  );
  switch (start.kind) {
    case "busy":
      return { kind: "not_offered" };
    case "failed":
      return { kind: "unavailable" };
    case "sent":
      return started.copy === undefined
        ? { kind: "unavailable" }
        : { kind: "started", copy: toWireCopy(started.copy) };
    case "answered":
      return start.outcome.kind === "printed" || start.outcome.kind === "abandoned"
        ? { kind: "started", copy: toWireCopy(start.outcome.copy) }
        : start.outcome;
  }
}

export async function reprintSaleReceiptFor(
  deps: ReceiptRequestDeps,
  { saleId, reason, authorization }: ReprintSaleReceiptRequest,
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
      copyAfterGrant(deps, saleId, started);
      return {
        kind: "granted",
        grant: {
          actorId: guarded.result.signedInUserId,
          authorizedBy: guarded.authorized_by?.user_id,
        },
      };
    },
  };
  const start = await deps.jobs.start(saleId, ({ watch, printer }) =>
    reprintSaleReceipt(
      printingPorts(deps, chainKey, authority, printer(deps.printer)),
      { saleId, reason },
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
