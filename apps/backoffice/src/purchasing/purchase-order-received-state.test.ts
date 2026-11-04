import { expect, test } from "vitest";
import {
  PURCHASE_ORDER_RECEIVED_STATE,
  purchaseOrderReceivedIn,
} from "./purchase-order-received-state";

test("reads a history state carrying the received mark, beside whatever else it holds", () => {
  expect(purchaseOrderReceivedIn(PURCHASE_ORDER_RECEIVED_STATE)).toBe(true);
  expect(purchaseOrderReceivedIn({ key: "a1", ...PURCHASE_ORDER_RECEIVED_STATE })).toBe(true);
});

test.each([
  ["no state", undefined],
  ["a state without the mark", { key: "a1" }],
  ["a mark that is not set", { purchaseOrderReceived: false }],
  ["a mark of another value", { purchaseOrderReceived: "true" }],
  ["the mark of a registered purchase", { purchaseRegistered: true }],
])("reads %s as no receipt registered", (_name, historyState) => {
  expect(purchaseOrderReceivedIn(historyState)).toBe(false);
});
