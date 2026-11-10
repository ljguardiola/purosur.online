import { expectTypeOf, test } from "vitest";
import type { RefundStoreTransaction } from "./refund-store.js";

type ResolvedAlertKind = Parameters<RefundStoreTransaction["resolveRefundAlert"]>[1];

test("a refund's alert is resolved only as one of the kinds a refund's alert has", () => {
  expectTypeOf<ResolvedAlertKind>().toEqualTypeOf<"late_payment_refund" | "refund_task">();
});
