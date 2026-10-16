import {
  type HandConfirmedPaymentsBody,
  handConfirmedPaymentMethodSchema,
} from "@purosur/contracts";
import {
  Card,
  dataColumn,
  EmptyState,
  FigureStat,
  formatCents,
  formatNumber,
  formatOperationNumber,
  ListFilter,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Wallet } from "lucide-react";
import { useId } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import { paymentMethodLabel } from "../platform/payment-method-label";
import { ReportFilters } from "../shell/report-filters";
import type { ReportRegisterField } from "../shell/report-register-field";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTopBar } from "../shell/screen-top-bar";
import { handConfirmedMoment } from "./hand-confirmed-moment";
import {
  type HandConfirmedPaymentsFilters,
  handConfirmedPaymentsQueryOf,
} from "./hand-confirmed-payments-filters";
import type { HandConfirmedPaymentsScreenServices } from "./hand-confirmed-payments-services";
import { useHandConfirmedPaymentsQuery } from "./payments-queries";

export type HandConfirmedPaymentsScreenProps = {
  filters: HandConfirmedPaymentsFilters;
  onFiltersChange: (filters: HandConfirmedPaymentsFilters) => void;
  onSessionEnded: () => void;
  registerFilter: ReportRegisterField;
  services: HandConfirmedPaymentsScreenServices;
};

type CashierRow = HandConfirmedPaymentsBody["cashiers"][number];
type PaymentRow = HandConfirmedPaymentsBody["payments"][number];
type MethodTotal = HandConfirmedPaymentsBody["methods"][number];

const NO_CASHIERS: CashierRow[] = [];
const NO_PAYMENTS: PaymentRow[] = [];

const UNIDENTIFIED = "Sin identificar";
const NO_NAME = "—";

const METHOD_OPTIONS = [
  { value: "ALL", label: "Todos" },
  ...handConfirmedPaymentMethodSchema.options.map((method) => ({
    value: method,
    label: paymentMethodLabel(method),
  })),
] as const;

function totalOf(methods: readonly MethodTotal[], method: MethodTotal["method"]) {
  return methods.find((total) => total.method === method) ?? { method, count: 0, amount: 0 };
}

function methodCell(cashier: CashierRow, method: MethodTotal["method"]) {
  const total = totalOf(cashier.methods, method);
  return (
    <TableCellText description={formatCents(total.amount)}>
      {formatNumber(total.count)}
    </TableCellText>
  );
}

const cashierColumns = [
  dataColumn({
    id: "cashier",
    header: "Cajero",
    render: (cashier: CashierRow) => cashier.cashier_name ?? UNIDENTIFIED,
  }),
  dataColumn({
    id: "transfers",
    header: "Transferencias",
    align: "end",
    render: (cashier: CashierRow) => methodCell(cashier, "TRANSFER"),
  }),
  dataColumn({
    id: "standaloneTerminal",
    header: "Terminal independiente",
    align: "end",
    render: (cashier: CashierRow) => methodCell(cashier, "STANDALONE_TERMINAL"),
  }),
  dataColumn({
    id: "payments",
    header: "Pagos",
    align: "end",
    render: (cashier: CashierRow) => formatNumber(cashier.count),
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    render: (cashier: CashierRow) => (
      <TableCellText strong>{formatCents(cashier.amount)}</TableCellText>
    ),
  }),
] as const;

const paymentColumns = [
  dataColumn({
    id: "confirmedAt",
    header: "Confirmado",
    render: (payment: PaymentRow) => {
      const { date, time } = handConfirmedMoment(payment.confirmed_at);
      return <TableCellText description={time}>{date}</TableCellText>;
    },
  }),
  dataColumn({
    id: "method",
    header: "Medio",
    render: (payment: PaymentRow) => (
      <TableCellText
        description={
          payment.sale_operation_number === null
            ? undefined
            : `Operación ${formatOperationNumber(payment.sale_operation_number)}`
        }
      >
        {paymentMethodLabel(payment.method)}
      </TableCellText>
    ),
  }),
  dataColumn({
    id: "cashier",
    header: "Cajero",
    render: (payment: PaymentRow) => payment.cashier_name ?? NO_NAME,
  }),
  dataColumn({
    id: "confirmedBy",
    header: "Confirmó",
    render: (payment: PaymentRow) => payment.confirmed_by_name ?? NO_NAME,
  }),
  dataColumn({
    id: "amount",
    header: "Importe",
    align: "end",
    render: (payment: PaymentRow) => (
      <TableCellText strong>{formatCents(payment.amount)}</TableCellText>
    ),
  }),
] as const;

export function HandConfirmedPaymentsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  registerFilter,
  services,
}: HandConfirmedPaymentsScreenProps) {
  const cashiersHeadingId = useId();
  const paymentsHeadingId = useId();
  const filtered = filters.register !== "ALL" || filters.method !== "ALL";
  const data = useHandConfirmedPaymentsQuery({
    query: handConfirmedPaymentsQueryOf(filters),
    fetchHandConfirmedPayments: services.fetchHandConfirmedPayments,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const cashiersTable = useTableModel({
    items: shown?.cashiers ?? NO_CASHIERS,
    id: (cashier) => cashier.cashier_id,
    columns: cashierColumns,
  });
  const paymentsTable = useTableModel({
    items: shown?.payments ?? NO_PAYMENTS,
    id: (payment) => payment.id,
    columns: paymentColumns,
  });
  const transfers = shown ? totalOf(shown.methods, "TRANSFER") : undefined;
  const standaloneTerminal = shown ? totalOf(shown.methods, "STANDALONE_TERMINAL") : undefined;
  const noPayments = data.status === "loaded" && data.value.payments.length === 0;

  return (
    <ScreenLayout
      topBar={<ScreenTopBar eyebrow="Reportes · Caja" title="Pagos confirmados a mano" />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.range}
          registerFilter={registerFilter}
        />
        <ListFilter
          name="method"
          label="Medio:"
          options={METHOD_OPTIONS}
          value={filters.method}
          onChange={(method) => onFiltersChange({ ...filters, method })}
        />
      </div>
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {shown && transfers && standaloneTerminal ? (
            <>
              <Card>
                <FigureStat
                  size="heading"
                  label="Pagos"
                  detail={formatCents(shown.totals.amount)}
                  value={formatNumber(shown.totals.count)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Transferencias"
                  detail={formatCents(transfers.amount)}
                  value={formatNumber(transfers.count)}
                />
              </Card>
              <Card>
                <FigureStat
                  size="heading"
                  label="Terminal independiente"
                  detail={formatCents(standaloneTerminal.amount)}
                  value={formatNumber(standaloneTerminal.count)}
                />
              </Card>
            </>
          ) : (
            <>
              <Card>
                <FigureStat size="heading" label="Pagos" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Transferencias" loading />
              </Card>
              <Card>
                <FigureStat size="heading" label="Terminal independiente" loading />
              </Card>
            </>
          )}
        </div>
      )}
      {noPayments ? (
        <EmptyState
          icon={<Wallet />}
          title="No hay pagos confirmados a mano en este período"
          variant={filtered ? "filtered" : "blank"}
        />
      ) : (
        <>
          <section aria-labelledby={cashiersHeadingId} className="flex flex-col gap-3">
            <h2 id={cashiersHeadingId} className="text-subheading text-text">
              Por cajero
            </h2>
            <Table
              aria-label="Pagos confirmados a mano por cajero"
              table={cashiersTable}
              {...cloudTableState(data, "los pagos confirmados a mano por cajero")}
            />
          </section>
          <section aria-labelledby={paymentsHeadingId} className="flex flex-col gap-3">
            <h2 id={paymentsHeadingId} className="text-subheading text-text">
              Detalle de pagos
            </h2>
            <Table
              aria-label="Pagos confirmados a mano"
              table={paymentsTable}
              {...cloudTableState(data, "los pagos confirmados a mano")}
            />
          </section>
        </>
      )}
    </ScreenLayout>
  );
}
