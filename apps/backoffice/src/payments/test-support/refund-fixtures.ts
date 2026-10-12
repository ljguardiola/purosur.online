import type { PendingRefundsBody } from "@purosur/contracts";

export const TRANSFER_REFUND_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const SECOND_REFUND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const transferRefund: PendingRefundsBody["refunds"][number] = {
  id: TRANSFER_REFUND_ID,
  sale_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  register_id: "11111111-1111-4111-8111-111111111111",
  register_name: "Caja principal",
  method: "TRANSFER",
  origin: "sale_cancelled",
  discardable: false,
  amount: 250_000,
  occurred_at: "2026-10-07T15:30:00.000Z",
  seconds_pending: 3 * 3600,
  sale_occurred_at: "2026-10-07T15:30:00.000Z",
  covered_by: [],
  provider_order_id: null,
  cancelled_by: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  cancelled_by_name: "Lucía",
};

const secondRefund: PendingRefundsBody["refunds"][number] = {
  id: SECOND_REFUND_ID,
  sale_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  register_id: "22222222-2222-4222-8222-222222222222",
  register_name: "Caja del fondo",
  method: "TRANSFER",
  origin: "sale_cancelled",
  discardable: false,
  amount: 98_000,
  occurred_at: "2026-10-07T18:05:00.000Z",
  seconds_pending: 20 * 60,
  sale_occurred_at: "2026-10-07T18:05:00.000Z",
  covered_by: [],
  provider_order_id: null,
  cancelled_by: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  cancelled_by_name: null,
};

export const LATE_PAYMENT_REFUND_ID = "99999999-9999-4999-8999-999999999999";

export const latePaymentRefund: PendingRefundsBody["refunds"][number] = {
  id: LATE_PAYMENT_REFUND_ID,
  sale_id: "88888888-8888-4888-8888-888888888888",
  register_id: "33333333-3333-4333-8333-333333333333",
  register_name: "Caja del frente",
  method: "QR",
  origin: "late_payment",
  discardable: true,
  amount: 125_000,
  occurred_at: "2026-10-08T13:10:00.000Z",
  seconds_pending: 27 * 3600,
  sale_occurred_at: "2026-10-08T12:37:00.000Z",
  covered_by: ["TRANSFER"],
  provider_order_id: null,
  cancelled_by: null,
  cancelled_by_name: null,
};

const OTHER_ORDER_REFUND_ID = "77777777-7777-4777-8777-777777777777";

const latePaymentOfOtherOrderRefund: PendingRefundsBody["refunds"][number] = {
  ...latePaymentRefund,
  id: OTHER_ORDER_REFUND_ID,
  amount: 118_000,
  covered_by: ["QR"],
  provider_order_id: "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3",
};

export const pendingRefunds: PendingRefundsBody = { refunds: [transferRefund, secondRefund] };

export const noPendingRefunds: PendingRefundsBody = { refunds: [] };

export const pendingRefundsWithLatePayment: PendingRefundsBody = {
  refunds: [transferRefund, latePaymentRefund],
};

export const pendingRefundsWithLatePaymentOfOtherOrder: PendingRefundsBody = {
  refunds: [transferRefund, latePaymentOfOtherOrderRefund],
};
