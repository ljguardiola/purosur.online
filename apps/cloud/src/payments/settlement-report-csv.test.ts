import { describe, expect, it } from "vitest";
import { readSettlementReportCsv } from "./settlement-report-csv.js";
import {
  CSV_HEADER,
  REFUND_ROW,
  SALE_ROW,
  settlementReportCsv,
} from "./test-support/mercado-pago-documented-settlement-reports.js";

function withField(row: readonly string[], key: string, value: string): string[] {
  return row.map((field, index) => (CSV_HEADER[index] === key ? value : field));
}

function readOneRow(row: readonly string[]) {
  return readSettlementReportCsv(settlementReportCsv({ rows: [row] }));
}

describe("reading a settlement report", () => {
  it("reads every row with its amounts in cents and its dates as instants", () => {
    expect(readSettlementReportCsv(settlementReportCsv())).toEqual([
      {
        sourceId: "1000000001",
        externalReference: "0b0a5a42-1f9a-4a53-9f55-3e1c1c0d7a10",
        transactionType: "SETTLEMENT",
        transactionDate: new Date("2019-08-12T02:20:19.000Z"),
        grossAmount: 310_900,
        feeAmount: -12_436,
        financingFeeAmount: -885,
        taxesAmount: -312,
        netAmount: 297_267,
        moneyReleaseDate: new Date("2019-08-26T02:20:19.000Z"),
        paymentMethod: "visa",
        paymentMethodType: "credit_card",
      },
      {
        sourceId: "1000000002",
        externalReference: null,
        transactionType: "REFUND",
        transactionDate: new Date("2019-08-12T14:00:00.000Z"),
        grossAmount: -50_050,
        feeAmount: 0,
        financingFeeAmount: 0,
        taxesAmount: 0,
        netAmount: -50_050,
        moneyReleaseDate: null,
        paymentMethod: null,
        paymentMethodType: null,
      },
    ]);
  });

  it("reads a file separated by commas", () => {
    expect(readSettlementReportCsv(settlementReportCsv({ separator: "," }))).toHaveLength(2);
  });

  it("reads columns in any order and ignores the ones it does not read", () => {
    const reversed = [...CSV_HEADER].reverse();
    const csv = settlementReportCsv({
      header: reversed,
      rows: [[...SALE_ROW].reverse()],
    });

    expect(readSettlementReportCsv(csv)).toEqual(readOneRow(SALE_ROW));
  });

  it("tolerates Windows line breaks and a missing trailing line break", () => {
    const windows = settlementReportCsv({ lineBreak: "\r\n" });
    const unterminated = settlementReportCsv({ trailingLineBreak: false });

    expect(readSettlementReportCsv(windows)).toEqual(
      readSettlementReportCsv(settlementReportCsv()),
    );
    expect(readSettlementReportCsv(unterminated)).toHaveLength(2);
  });

  it("reads a header with no rows as an empty report", () => {
    expect(readSettlementReportCsv(settlementReportCsv({ rows: [] }))).toEqual([]);
  });

  it("reads quoted fields", () => {
    const quoted = SALE_ROW.map((field) => `"${field}"`);

    expect(readOneRow(quoted)).toEqual(readOneRow(SALE_ROW));
  });

  it.each([
    ["3109", 310_900],
    ["3109.5", 310_950],
    ["0.07", 7],
    ["-8.85", -885],
    ["19.99", 1_999],
    ["1234567.89", 123_456_789],
  ])("reads the amount %s as %i cents", (amount, cents) => {
    const rows = readOneRow(withField(SALE_ROW, "TRANSACTION_AMOUNT", amount));

    expect(rows?.[0]?.grossAmount).toBe(cents);
  });

  it.each(["", "abc", "1,5", "1.234", "1e3", "--3", "3109.", ".5"])(
    "refuses the file when the gross amount is %j",
    (amount) => {
      expect(readOneRow(withField(SALE_ROW, "TRANSACTION_AMOUNT", amount))).toBeNull();
    },
  );

  it.each(["FEE_AMOUNT", "SETTLEMENT_NET_AMOUNT"])("refuses the file when %s is empty", (key) => {
    expect(readOneRow(withField(SALE_ROW, key, ""))).toBeNull();
  });

  it("reads dates with an offset written with or without a colon, or in UTC", () => {
    const withColon = readOneRow(
      withField(SALE_ROW, "TRANSACTION_DATE", "2019-08-11T22:20:19-04:00"),
    );
    const without = readOneRow(withField(SALE_ROW, "TRANSACTION_DATE", "2019-08-11T22:20:19-0400"));
    const utc = readOneRow(withField(SALE_ROW, "TRANSACTION_DATE", "2019-08-12T02:20:19Z"));

    const expected = new Date("2019-08-12T02:20:19.000Z");
    expect(withColon?.[0]?.transactionDate).toEqual(expected);
    expect(without?.[0]?.transactionDate).toEqual(expected);
    expect(utc?.[0]?.transactionDate).toEqual(expected);
  });

  it.each(["", "yesterday", "2019-08-11", "2019-13-45T22:20:19-0400"])(
    "refuses the file when the transaction date is %j",
    (date) => {
      expect(readOneRow(withField(SALE_ROW, "TRANSACTION_DATE", date))).toBeNull();
    },
  );

  it("refuses the file when the money release date cannot be read", () => {
    expect(readOneRow(withField(SALE_ROW, "MONEY_RELEASE_DATE", "soon"))).toBeNull();
  });

  it.each(["SOURCE_ID", "TRANSACTION_TYPE"])("refuses the file when a row has no %s", (key) => {
    expect(readOneRow(withField(SALE_ROW, key, ""))).toBeNull();
  });

  it("refuses the whole file when only one of its rows cannot be read", () => {
    const broken = withField(REFUND_ROW, "TRANSACTION_AMOUNT", "oops");

    expect(readSettlementReportCsv(settlementReportCsv({ rows: [SALE_ROW, broken] }))).toBeNull();
  });

  it("refuses a row with fewer fields than the header", () => {
    expect(readOneRow(SALE_ROW.slice(0, 5))).toBeNull();
  });

  it.each(CSV_HEADER.slice(0, 12))("refuses a file whose header lacks %s", (key) => {
    const kept = CSV_HEADER.map((column, index) => ({ column, index })).filter(
      ({ column }) => column !== key,
    );
    const csv = settlementReportCsv({
      header: kept.map(({ column }) => column),
      rows: [kept.map(({ index }) => SALE_ROW[index] ?? "")],
    });

    expect(readSettlementReportCsv(csv)).toBeNull();
  });

  it.each(["", "\n", "\r\n"])("refuses a file with no header: %j", (csv) => {
    expect(readSettlementReportCsv(csv)).toBeNull();
  });
});
