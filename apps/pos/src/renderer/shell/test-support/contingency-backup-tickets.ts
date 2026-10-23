import type { ContingencyBackupTicketsAnswer } from "@purosur/contracts";

export function backupTickets(
  overrides: Partial<ContingencyBackupTicketsAnswer> = {},
): ContingencyBackupTicketsAnswer {
  return {
    to_print: 0,
    awaiting_customer_document: 0,
    missing_key: 0,
    kept: 0,
    discardable: 0,
    may_discard: false,
    discard_permitted: true,
    printer: null,
    ...overrides,
  };
}
