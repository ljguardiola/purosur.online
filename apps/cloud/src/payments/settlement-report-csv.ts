import type { SettlementReportRow } from "@purosur/domain/payments/use-cases";

const CENTS_PER_PESO = 100;
const SIGNED_DECIMAL_AMOUNT = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
const REPORT_DATE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const OFFSET_WITHOUT_COLON = /^([+-]\d{2})(\d{2})$/;
const SEPARATORS = [";", ","] as const;

export function parseSettlementReportDate(text: string): Date | null {
  const match = REPORT_DATE.exec(text);
  if (match === null) {
    return null;
  }
  const offset = (match[2] ?? "").replace(OFFSET_WITHOUT_COLON, "$1:$2");
  const date = new Date(`${match[1]}${offset}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function centsOfPesos(text: string): number | null {
  const match = SIGNED_DECIMAL_AMOUNT.exec(text);
  if (match === null) {
    return null;
  }
  const magnitude = Number(match[2]) * CENTS_PER_PESO + Number((match[3] ?? "").padEnd(2, "0"));
  const cents = match[1] === "-" ? -magnitude : magnitude;
  return Number.isSafeInteger(cents) ? cents : null;
}

function fieldsOf(line: string, separator: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (character === '"') {
      if (quoted && line.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === separator && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

export const SETTLEMENT_REPORT_KEYS = [
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

type ReadKey = (typeof SETTLEMENT_REPORT_KEYS)[number];

function separatorOf(headerLine: string): string {
  return SEPARATORS.find((separator) => headerLine.includes(separator)) ?? SEPARATORS[0];
}

function rowOf(get: (key: ReadKey) => string): SettlementReportRow | null {
  const sourceId = get("SOURCE_ID");
  const transactionType = get("TRANSACTION_TYPE");
  const transactionDate = parseSettlementReportDate(get("TRANSACTION_DATE"));
  const grossAmount = centsOfPesos(get("TRANSACTION_AMOUNT"));
  const feeAmount = centsOfPesos(get("FEE_AMOUNT"));
  const financingFeeAmount = centsOfPesos(get("FINANCING_FEE_AMOUNT") || "0");
  const taxesAmount = centsOfPesos(get("TAXES_AMOUNT") || "0");
  const netAmount = centsOfPesos(get("SETTLEMENT_NET_AMOUNT"));
  const releaseText = get("MONEY_RELEASE_DATE");
  const moneyReleaseDate = releaseText === "" ? null : parseSettlementReportDate(releaseText);
  if (
    sourceId === "" ||
    transactionType === "" ||
    transactionDate === null ||
    grossAmount === null ||
    feeAmount === null ||
    financingFeeAmount === null ||
    taxesAmount === null ||
    netAmount === null ||
    (releaseText !== "" && moneyReleaseDate === null)
  ) {
    return null;
  }
  return {
    sourceId,
    externalReference: get("EXTERNAL_REFERENCE") || null,
    transactionType,
    transactionDate,
    grossAmount,
    feeAmount,
    financingFeeAmount,
    taxesAmount,
    netAmount,
    moneyReleaseDate,
    paymentMethod: get("PAYMENT_METHOD") || null,
    paymentMethodType: get("PAYMENT_METHOD_TYPE") || null,
  };
}

export function readSettlementReportCsv(text: string): SettlementReportRow[] | null {
  const lines = text.split(/\r?\n/);
  const headerLine = lines[0] ?? "";
  if (headerLine.trim() === "") {
    return null;
  }
  const separator = separatorOf(headerLine);
  const header = fieldsOf(headerLine, separator).map((key) => key.trim());
  const columnOf = new Map(header.map((key, index) => [key, index]));
  if (SETTLEMENT_REPORT_KEYS.some((key) => !columnOf.has(key))) {
    return null;
  }
  const rows: SettlementReportRow[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === "") {
      continue;
    }
    const fields = fieldsOf(line, separator);
    if (fields.length < header.length) {
      return null;
    }
    const row = rowOf((key) => (fields[columnOf.get(key) ?? -1] ?? "").trim());
    if (row === null) {
      return null;
    }
    rows.push(row);
  }
  return rows;
}
