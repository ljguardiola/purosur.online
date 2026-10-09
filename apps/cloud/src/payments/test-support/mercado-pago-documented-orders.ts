// Shapes written from Mercado Pago's Orders API reference, not responses recorded from its servers.

export const ORDER_ID = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
export const ORDER_CARD_FIRST_SIX = "450995";
export const ORDER_CARD_LAST_FOUR = "3704";

interface DocumentedPayment {
  status: string;
  statusDetail: string;
  amount: string;
  paidAmount?: string;
  paymentMethod?: Record<string, unknown>;
}

interface DocumentedOrder {
  status: string;
  statusDetail: string;
  amount: string;
  paidAmount?: string;
  payments: DocumentedPayment[];
}

function documentedOrder(order: DocumentedOrder): Record<string, unknown> {
  return {
    id: ORDER_ID,
    type: "qr",
    processing_mode: "automatic",
    external_reference: "0b0a5a42-1f9a-4a53-9f55-3e1c1c0d7a10",
    total_amount: order.amount,
    ...(order.paidAmount === undefined ? {} : { total_paid_amount: order.paidAmount }),
    country_code: "ARG",
    user_id: "1234567890",
    status: order.status,
    status_detail: order.statusDetail,
    capture_mode: "automatic_async",
    created_date: "2026-10-09T12:00:00.000Z",
    last_updated_date: "2026-10-09T12:00:00.000Z",
    config: { qr: { external_pos_id: "STORE01POS01", mode: "static" } },
    transactions: {
      payments: order.payments.map((payment, index) => ({
        id: `PAY01JQ4S4KY8HWQ6NA5PXB65B3D${String(index)}`,
        reference_id: `01JQ4S4KY8HWQ6NA5PXB65B3D${String(index)}`,
        amount: payment.amount,
        ...(payment.paidAmount === undefined ? {} : { paid_amount: payment.paidAmount }),
        status: payment.status,
        status_detail: payment.statusDetail,
        ...(payment.paymentMethod === undefined ? {} : { payment_method: payment.paymentMethod }),
      })),
    },
  };
}

export function createdOrder(amount = "50.00"): Record<string, unknown> {
  return documentedOrder({
    status: "created",
    statusDetail: "created",
    amount,
    payments: [{ status: "created", statusDetail: "ready_to_process", amount }],
  });
}

export function paidOrder(amount = "50.00"): Record<string, unknown> {
  return documentedOrder({
    status: "processed",
    statusDetail: "accredited",
    amount,
    paidAmount: amount,
    payments: [
      {
        status: "processed",
        statusDetail: "accredited",
        amount,
        paidAmount: amount,
        paymentMethod: { id: "account_money", type: "account_money" },
      },
    ],
  });
}

export function paidWithDiscountOrder(amount = "50.00", paidAmount = "47.28") {
  return documentedOrder({
    status: "processed",
    statusDetail: "accredited",
    amount,
    paidAmount,
    payments: [
      {
        status: "processed",
        statusDetail: "accredited",
        amount,
        paidAmount,
        paymentMethod: { id: "account_money", type: "account_money" },
      },
    ],
  });
}

export function canceledOrder(amount = "50.00"): Record<string, unknown> {
  return documentedOrder({
    status: "canceled",
    statusDetail: "canceled",
    amount,
    payments: [{ status: "canceled", statusDetail: "canceled_by_api", amount }],
  });
}

export function expiredOrder(amount = "50.00"): Record<string, unknown> {
  return documentedOrder({
    status: "expired",
    statusDetail: "expired",
    amount,
    payments: [{ status: "expired", statusDetail: "expired", amount }],
  });
}

export function failedOrder(amount = "50.00"): Record<string, unknown> {
  return documentedOrder({
    status: "failed",
    statusDetail: "failed",
    amount,
    payments: [{ status: "failed", statusDetail: "rejected_by_issuer", amount }],
  });
}

export function paidWithCardOrder(amount = "50.00"): Record<string, unknown> {
  return documentedOrder({
    status: "processed",
    statusDetail: "accredited",
    amount,
    paidAmount: amount,
    payments: [
      {
        status: "processed",
        statusDetail: "accredited",
        amount,
        paidAmount: amount,
        paymentMethod: {
          id: "visa",
          type: "credit_card",
          installments: 1,
          card: { first_six_digits: ORDER_CARD_FIRST_SIX, last_four_digits: ORDER_CARD_LAST_FOUR },
        },
      },
    ],
  });
}
