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
  sent_by_cloud: false,
  delivery_stage: null,
  last_refusal_reason: null,
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
  sent_by_cloud: false,
  delivery_stage: null,
  last_refusal_reason: null,
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
  sent_by_cloud: true,
  delivery_stage: "unconfirmed",
  last_refusal_reason: null,
};

const LATE_POINT_PAYMENT_REFUND_ID = "98989898-9898-4989-8989-989898989898";

const latePointPaymentRefund: PendingRefundsBody["refunds"][number] = {
  ...latePaymentRefund,
  id: LATE_POINT_PAYMENT_REFUND_ID,
  method: "POINT",
  amount: 76_000,
  sent_by_cloud: false,
  delivery_stage: null,
};

const confirmedLatePaymentRefund: PendingRefundsBody["refunds"][number] = {
  ...latePaymentRefund,
  discardable: false,
  delivery_stage: "sent",
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

export const pendingRefundsWithLatePointPayment: PendingRefundsBody = {
  refunds: [transferRefund, latePointPaymentRefund],
};

export const pendingRefundsWithConfirmedLatePayment: PendingRefundsBody = {
  refunds: [transferRefund, confirmedLatePaymentRefund],
};

export const pendingRefundsWithLatePaymentOfOtherOrder: PendingRefundsBody = {
  refunds: [transferRefund, latePaymentOfOtherOrderRefund],
};

export const CLOUD_SENT_REFUND_ID = "55555555-5555-4555-8555-555555555555";

type PendingRefund = PendingRefundsBody["refunds"][number];

export const unconfirmedCloudRefund: PendingRefund = {
  ...transferRefund,
  id: CLOUD_SENT_REFUND_ID,
  register_id: "44444444-4444-4444-8444-444444444444",
  register_name: "Caja de la entrada",
  method: "QR",
  amount: 340_000,
  sent_by_cloud: true,
  delivery_stage: "unconfirmed",
};

export const confirmedUnsentCloudRefund: PendingRefund = {
  ...unconfirmedCloudRefund,
  delivery_stage: "confirmed",
};

export const sentCloudRefund: PendingRefund = {
  ...unconfirmedCloudRefund,
  delivery_stage: "sent",
};

export const noBalanceCloudRefund: PendingRefund = {
  ...unconfirmedCloudRefund,
  delivery_stage: "waiting_for_balance",
  last_refusal_reason: "insufficient_balance",
};

export const refusedCloudRefund: PendingRefund = {
  ...unconfirmedCloudRefund,
  delivery_stage: "refused",
  last_refusal_reason: "refund_period_exceeded",
};

export const pendingRefundsWithUnconfirmedCloudRefund: PendingRefundsBody = {
  refunds: [transferRefund, unconfirmedCloudRefund],
};

export const pendingRefundsOfEveryCloudRefundStage: PendingRefundsBody = {
  refunds: [
    unconfirmedCloudRefund,
    { ...confirmedUnsentCloudRefund, id: "66666666-6666-4666-8666-666666666661" },
    { ...sentCloudRefund, id: "66666666-6666-4666-8666-666666666662" },
    { ...noBalanceCloudRefund, id: "66666666-6666-4666-8666-666666666663" },
    { ...refusedCloudRefund, id: "66666666-6666-4666-8666-666666666664" },
  ],
};
