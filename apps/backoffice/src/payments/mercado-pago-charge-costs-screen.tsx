import { type MercadoPagoChargeCostsBody, mercadoPagoChargeCostsSchema } from "@purosur/contracts";
import {
  Card,
  dataColumn,
  FigureStat,
  formatDayAndTime,
  formatMonthAndYear,
  formatNumber,
  formatSignedCents,
  ListFilter,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { Landmark } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import { formatDisplayDate } from "../platform/display-date";
import { schemaText } from "../platform/schema-text";
import { AreaTopBar } from "../shell/area-top-bar";
import { ReportFilters } from "../shell/report-filters";
import { ScreenLayout } from "../shell/screen-layout";
import type { MercadoPagoChargeCostsFilters } from "./mercado-pago-charge-costs-filters";
import type { MercadoPagoChargeCostsScreenServices } from "./mercado-pago-charge-costs-services";
import { useMercadoPagoChargeCostsQuery } from "./payments-queries";

export type MercadoPagoChargeCostsScreenProps = {
  filters: MercadoPagoChargeCostsFilters;
  onFiltersChange: (filters: MercadoPagoChargeCostsFilters) => void;
  onSessionEnded: () => void;
  services: MercadoPagoChargeCostsScreenServices;
};

const SCREEN_TITLE = "Costos de Mercado Pago";
const OTHER_CHARGES = "Otros cobros";
const PENDING = "Pendiente";
const OTHER_CHARGES_NOTE =
  "Los otros cobros son cobros de Mercado Pago que no salieron de una venta del sistema; se muestran en el reporte de todas las sucursales.";

const CHARGE_TIME_ZONE = schemaText(
  mercadoPagoChargeCostsSchema.shape.charges.element.shape.charged_at.meta()?.["timeZone"],
);

type Grouping = MercadoPagoChargeCostsFilters["group"];
type Charge = MercadoPagoChargeCostsBody["charges"][number];
type Totals = MercadoPagoChargeCostsBody["totals"];
type GroupRow = Totals & { key: string; label: string };

const NO_CHARGES: Charge[] = [];
const NO_ROWS: GroupRow[] = [];

const GROUPING_OPTIONS = [
  { value: "day" as const, label: "Día", noun: "día" },
  { value: "month" as const, label: "Mes", noun: "mes" },
  { value: "method" as const, label: "Medio de pago", noun: "medio de pago" },
  { value: "register" as const, label: "Caja", noun: "caja" },
] as const;

const METHOD_LABELS = {
  QR: "QR",
  POINT: "Point",
  OTHER: OTHER_CHARGES,
} as const;

function monthLabel(month: string): string {
  const [year = 0, number = 0] = month.split("-").map(Number);
  return formatMonthAndYear(year, number);
}

function groupRows(grouping: Grouping, body: MercadoPagoChargeCostsBody | undefined): GroupRow[] {
  if (body === undefined) {
    return NO_ROWS;
  }
  switch (grouping) {
    case "day":
      return body.days.map((entry) => ({
        ...entry,
        key: entry.day,
        label: formatDisplayDate(entry.day),
      }));
    case "month":
      return body.months.map((entry) => ({
        ...entry,
        key: entry.month,
        label: monthLabel(entry.month),
      }));
    case "method":
      return body.methods.map((entry) => ({
        ...entry,
        key: entry.method,
        label: METHOD_LABELS[entry.method],
      }));
    case "register":
      return body.registers.map((entry) => ({
        ...entry,
        key: entry.register_id ?? "other",
        label: entry.register_id === null ? OTHER_CHARGES : (entry.register_name ?? OTHER_CHARGES),
      }));
  }
}

function groupColumns(grouping: Grouping) {
  return [
    dataColumn({
      id: "group",
      header: GROUPING_OPTIONS.find((option) => option.value === grouping)?.label ?? "",
      render: (row: GroupRow) => row.label,
    }),
    dataColumn({
      id: "charges",
      header: "Cobros",
      align: "end",
      render: (row: GroupRow) => formatNumber(row.charges_count),
    }),
    dataColumn({
      id: "pending",
      header: "Pendientes",
      align: "end",
      render: (row: GroupRow) => formatNumber(row.pending_count),
    }),
    dataColumn({
      id: "gross",
      header: "Cobrado",
      align: "end",
      render: (row: GroupRow) => (
        <TableCellText strong>{formatSignedCents(row.gross_amount)}</TableCellText>
      ),
    }),
    dataColumn({
      id: "fee",
      header: "Comisión",
      align: "end",
      render: (row: GroupRow) => formatSignedCents(row.fee_amount),
    }),
    dataColumn({
      id: "financing",
      header: "Financiación",
      align: "end",
      render: (row: GroupRow) => formatSignedCents(row.financing_fee_amount),
    }),
    dataColumn({
      id: "taxes",
      header: "Impuestos",
      align: "end",
      render: (row: GroupRow) => formatSignedCents(row.taxes_amount),
    }),
    dataColumn({
      id: "net",
      header: "Neto",
      align: "end",
      render: (row: GroupRow) => (
        <TableCellText strong>{formatSignedCents(row.net_amount)}</TableCellText>
      ),
    }),
  ] as const;
}

function costOrPending(charge: Charge, figure: (cost: NonNullable<Charge["cost"]>) => string) {
  return charge.cost === null ? PENDING : figure(charge.cost);
}

const chargeColumns = [
  dataColumn({
    id: "chargedAt",
    header: "Fecha y hora",
    render: (charge: Charge) => formatDayAndTime(charge.charged_at, CHARGE_TIME_ZONE),
  }),
  dataColumn({
    id: "register",
    header: "Caja",
    render: (charge: Charge) => charge.register_name,
  }),
  dataColumn({
    id: "method",
    header: "Medio de pago",
    render: (charge: Charge) => METHOD_LABELS[charge.method],
  }),
  dataColumn({
    id: "amount",
    header: "Monto cobrado",
    align: "end",
    render: (charge: Charge) =>
      costOrPending(charge, (cost) => formatSignedCents(cost.gross_amount)),
  }),
  dataColumn({
    id: "fee",
    header: "Comisión",
    align: "end",
    render: (charge: Charge) => costOrPending(charge, (cost) => formatSignedCents(cost.fee_amount)),
  }),
  dataColumn({
    id: "financing",
    header: "Financiación",
    align: "end",
    render: (charge: Charge) =>
      costOrPending(charge, (cost) => formatSignedCents(cost.financing_fee_amount)),
  }),
  dataColumn({
    id: "taxes",
    header: "Impuestos",
    align: "end",
    render: (charge: Charge) =>
      costOrPending(charge, (cost) => formatSignedCents(cost.taxes_amount)),
  }),
  dataColumn({
    id: "net",
    header: "Neto",
    align: "end",
    render: (charge: Charge) => costOrPending(charge, (cost) => formatSignedCents(cost.net_amount)),
  }),
  dataColumn({
    id: "release",
    header: "Liberación",
    render: (charge: Charge) =>
      costOrPending(charge, (cost) =>
        cost.money_release_date === null
          ? ""
          : formatDayAndTime(cost.money_release_date, CHARGE_TIME_ZONE),
      ),
  }),
] as const;

function totalCards(totals: Totals | undefined) {
  return [
    { label: "Cobrado", value: totals && formatSignedCents(totals.gross_amount) },
    { label: "Comisión de Mercado Pago", value: totals && formatSignedCents(totals.fee_amount) },
    {
      label: "Costo de financiación",
      value: totals && formatSignedCents(totals.financing_fee_amount),
    },
    { label: "Impuestos", value: totals && formatSignedCents(totals.taxes_amount) },
    { label: "Neto acreditado", value: totals && formatSignedCents(totals.net_amount) },
    { label: "Cobros pendientes", value: totals && formatNumber(totals.pending_count) },
  ];
}

export function MercadoPagoChargeCostsScreen({
  filters,
  onFiltersChange,
  onSessionEnded,
  services,
}: MercadoPagoChargeCostsScreenProps) {
  const data = useMercadoPagoChargeCostsQuery({
    query: filters.from === "" ? {} : { from: filters.from, to: filters.to },
    fetchMercadoPagoChargeCosts: services.fetchMercadoPagoChargeCosts,
    onSessionEnded,
  });
  const shown = data.status === "loaded" ? data.value : data.lastValue;
  const groupTable = useTableModel({
    items: groupRows(filters.group, shown),
    id: (row) => row.key,
    columns: groupColumns(filters.group),
  });
  const chargesTable = useTableModel({
    items: shown?.charges ?? NO_CHARGES,
    id: (charge) => charge.payment_transaction_id,
    columns: chargeColumns,
  });
  const noun = GROUPING_OPTIONS.find((option) => option.value === filters.group)?.noun ?? "";
  const empty = {
    icon: <Landmark />,
    title: "No hay cobros de Mercado Pago en este período",
    variant: filters.from === "" ? ("blank" as const) : ("filtered" as const),
  };

  return (
    <ScreenLayout
      topBar={<AreaTopBar eyebrow="Reportes · Cobros" title={SCREEN_TITLE} />}
      bodyClassName="gap-4 p-6"
    >
      <div className="flex flex-wrap items-end gap-3">
        <ReportFilters
          filters={filters}
          onFiltersChange={onFiltersChange}
          answeredPeriod={shown?.range}
        />
        <ListFilter
          name="group"
          label="Agrupar por:"
          options={GROUPING_OPTIONS}
          value={filters.group}
          onChange={(group) => onFiltersChange({ ...filters, group })}
        />
      </div>
      {data.status === "failed" ? null : (
        <div className="grid grid-cols-3 gap-4">
          {totalCards(shown?.totals).map(({ label, value }) => (
            <Card key={label}>
              {value === undefined ? (
                <FigureStat size="heading" label={label} loading />
              ) : (
                <FigureStat size="heading" label={label} value={value} />
              )}
            </Card>
          ))}
        </div>
      )}
      <Table
        aria-label={`Totales por ${noun}`}
        table={groupTable}
        {...cloudTableState(data, "los costos de Mercado Pago")}
        empty={empty}
      />
      {data.status === "failed" ? null : (
        <>
          <p className="text-text-subtle">{OTHER_CHARGES_NOTE}</p>
          <Table
            aria-label="Cobros de Mercado Pago"
            table={chargesTable}
            {...cloudTableState(data, "los cobros de Mercado Pago")}
            empty={empty}
          />
        </>
      )}
    </ScreenLayout>
  );
}
