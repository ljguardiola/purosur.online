import type { CashSessionClosesBody } from "@purosur/contracts";
import { dataColumn, formatCents, formatSignedCents, TableCellText } from "@purosur/ui";
import { reportMoment } from "../platform/report-moment";
import { CLOSED_TIME_ZONE } from "./cash-session-closes-closed-time-zone";
import { UNIDENTIFIED } from "./cash-session-closes-text";

export type CashSessionCloseRow = CashSessionClosesBody["sessions"][number];

function differenceCell(session: CashSessionCloseRow) {
  if (!session.has_difference) {
    return <TableCellText strong>Sin diferencia</TableCellText>;
  }
  return (
    <TableCellText strong tone={session.difference < 0 ? "error" : "success"}>
      {formatSignedCents(session.difference)}
    </TableCellText>
  );
}

const closedAtColumn = dataColumn({
  id: "closedAt",
  header: "Fecha",
  render: (session: CashSessionCloseRow) => {
    const { date, time } = reportMoment(session.closed_at, CLOSED_TIME_ZONE);
    return <TableCellText description={time}>{date}</TableCellText>;
  },
});

const registerColumn = dataColumn({
  id: "register",
  header: "Caja",
  render: (session: CashSessionCloseRow) => session.register_name,
});

const cashFlowColumns = [
  dataColumn({
    id: "cashier",
    header: "Cajero",
    render: (session: CashSessionCloseRow) => (
      <TableCellText
        description={
          session.closed_by_id === session.cashier_id
            ? undefined
            : `Cerró: ${session.closed_by_name ?? UNIDENTIFIED}`
        }
      >
        {session.cashier_name ?? UNIDENTIFIED}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "expected",
    header: "Esperado",
    align: "end",
    render: (session: CashSessionCloseRow) => formatCents(session.expected_cash),
  }),
  dataColumn({
    id: "counted",
    header: "Contado",
    align: "end",
    render: (session: CashSessionCloseRow) => formatCents(session.counted_cash),
  }),
  dataColumn({
    id: "difference",
    header: "Diferencia",
    align: "end",
    render: differenceCell,
  }),
] as const;

export const cashSessionCloseColumns = [
  closedAtColumn,
  registerColumn,
  ...cashFlowColumns,
] as const;

export const registerSessionCloseColumns = [closedAtColumn, ...cashFlowColumns] as const;
