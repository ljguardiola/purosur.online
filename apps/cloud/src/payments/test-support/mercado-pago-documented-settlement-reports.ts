// Shapes written from Mercado Pago's Settlement report API reference, not responses recorded from its servers.

export const READ_COLUMN_KEYS = [
  "SOURCE_ID",
  "EXTERNAL_REFERENCE",
  "TRANSACTION_TYPE",
  "TRANSACTION_DATE",
  "TRANSACTION_AMOUNT",
  "FEE_AMOUNT",
  "FINANCING_FEE_AMOUNT",
  "TAXES_AMOUNT",
  "SETTLEMENT_NET_AMOUNT",
  "MONEY_RELEASE_DATE",
  "PAYMENT_METHOD",
  "PAYMENT_METHOD_TYPE",
] as const;

export const REPORT_FILE_NAME = "purosur-settlement-2026-09-08.csv";

export function documentedConfiguration(
  columnKeys: readonly string[] = [...READ_COLUMN_KEYS, "INSTALLMENTS"],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    file_name_prefix: "settlement-report",
    columns: columnKeys.map((key) => ({ key })),
    separator: ",",
    display_timezone: "GMT-03",
    include_withdraw: true,
    refund_detailed: true,
    show_fee_prevision: false,
    show_chargeback_cancel: false,
    coupon_detailed: false,
    shipping_detail: false,
    report_translation: "es",
    notification_email_list: ["fictional.owner@example.com"],
    sftp_info: { server: "sftp.example.com", username: "fictional", remote_dir: "/reports" },
    scheduled: true,
    frequency: { hour: 4, type: "weekly", value: "monday" },
    ...overrides,
  };
}

export const CONFIGURATION_NOT_FOUND = {
  message: "Configuration not found for user",
  error: "not_found",
  status: 404,
};

export function documentedReportList(): Record<string, unknown>[] {
  return [
    {
      id: 2001,
      user_id: 900000001,
      begin_date: "2026-09-08T03:00:00Z",
      end_date: "2026-09-09T02:59:59Z",
      file_name: REPORT_FILE_NAME,
      created_from: "manual",
      date_created: "2026-09-09T10:07:53.000-04:00",
    },
    {
      id: 2002,
      user_id: 900000001,
      begin_date: "2026-09-09T03:00:00Z",
      end_date: "2026-09-10T02:59:59Z",
      file_name: "purosur-settlement-2026-09-09.csv",
      created_from: "schedule",
      date_created: "2016-01-20T10:07:53.000-04:00",
    },
  ];
}

export const CSV_HEADER = [
  "SOURCE_ID",
  "EXTERNAL_REFERENCE",
  "TRANSACTION_TYPE",
  "TRANSACTION_DATE",
  "TRANSACTION_AMOUNT",
  "FEE_AMOUNT",
  "FINANCING_FEE_AMOUNT",
  "TAXES_AMOUNT",
  "SETTLEMENT_NET_AMOUNT",
  "MONEY_RELEASE_DATE",
  "PAYMENT_METHOD",
  "PAYMENT_METHOD_TYPE",
  "INSTALLMENTS",
] as const;

export const SALE_ROW = [
  "1000000001",
  "0b0a5a42-1f9a-4a53-9f55-3e1c1c0d7a10",
  "SETTLEMENT",
  "2019-08-11T22:20:19.000-04:00",
  "3109.00",
  "-124.36",
  "-8.85",
  "-3.12",
  "2972.67",
  "2019-08-25T22:20:19.000-04:00",
  "visa",
  "credit_card",
  "3",
];

export const REFUND_ROW = [
  "1000000002",
  "",
  "REFUND",
  "2019-08-12T10:00:00-0400",
  "-500.5",
  "0.00",
  "",
  "",
  "-500.50",
  "",
  "",
  "",
  "",
];

export function settlementReportCsv(
  options: {
    header?: readonly string[];
    rows?: readonly (readonly string[])[];
    separator?: string;
    lineBreak?: string;
    trailingLineBreak?: boolean;
  } = {},
): string {
  const separator = options.separator ?? ";";
  const lineBreak = options.lineBreak ?? "\n";
  const lines = [options.header ?? CSV_HEADER, ...(options.rows ?? [SALE_ROW, REFUND_ROW])].map(
    (fields) => fields.join(separator),
  );
  return lines.join(lineBreak) + (options.trailingLineBreak === false ? "" : lineBreak);
}
