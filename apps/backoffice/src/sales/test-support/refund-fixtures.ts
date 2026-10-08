import type { PendingRefundsBody } from "@purosur/contracts";

export const TRANSFER_REFUND_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const SECOND_REFUND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const transferRefund: PendingRefundsBody["refunds"][number] = {
  id: TRANSFER_REFUND_ID,
  sale_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  register_id: "11111111-1111-4111-8111-111111111111",
  register_name: "Caja principal",
  method: "TRANSFER",
  amount: 250_000,
  occurred_at: "2026-10-07T15:30:00.000Z",
  cancelled_by: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  cancelled_by_name: "Lucía",
};

const secondRefund: PendingRefundsBody["refunds"][number] = {
  id: SECOND_REFUND_ID,
  sale_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  register_id: "22222222-2222-4222-8222-222222222222",
  register_name: "Caja del fondo",
  method: "TRANSFER",
  amount: 98_000,
  occurred_at: "2026-10-07T18:05:00.000Z",
  cancelled_by: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  cancelled_by_name: null,
};

export const pendingRefunds: PendingRefundsBody = { refunds: [transferRefund, secondRefund] };

export const noPendingRefunds: PendingRefundsBody = { refunds: [] };
