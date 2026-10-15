import {
  dataColumn,
  formatCalendarDayNumeric,
  formatCalendarDayRange,
  formatPointOfSaleNumber,
  InlineNotice,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { FileText, TriangleAlert } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import { presentationStateBadge } from "./fortnight-presentation-labels";
import type { FortnightPresentation } from "./fortnight-presentations-api";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

type FortnightReportsSectionProps = {
  data: CloudData<[FortnightPresentation[], RegisterPointOfSale[]]>;
};

const NO_PRESENTATIONS: FortnightPresentation[] = [];
const UNKNOWN_REGISTER = "Una caja";

export function FortnightReportsSection({ data }: FortnightReportsSectionProps) {
  const [presentations, registers] = data.status === "loaded" ? data.value : [NO_PRESENTATIONS, []];
  const registerNameOf = (registerId: string) =>
    registers.find((register) => register.registerId === registerId)?.registerName ??
    UNKNOWN_REGISTER;
  const columns = [
    dataColumn({
      id: "fortnight",
      header: "Quincena",
      render: (item: FortnightPresentation) =>
        formatCalendarDayRange(item.fortnight.start, item.fortnight.end),
    }),
    dataColumn({
      id: "pointOfSale",
      header: "Punto de venta",
      render: (item: FortnightPresentation) => formatPointOfSaleNumber(item.pointOfSaleNumber),
    }),
    dataColumn({
      id: "state",
      header: "Estado",
      render: (item: FortnightPresentation) => {
        const { label, tone } = presentationStateBadge(item.state);
        return <StatusIndicator tone={tone}>{label}</StatusIndicator>;
      },
    }),
    dataColumn({
      id: "deadline",
      header: "Vence",
      render: (item: FortnightPresentation) => (
        <span className={item.state === "accepted" ? undefined : "text-warning-strong"}>
          {formatCalendarDayNumeric(item.deadline)}
        </span>
      ),
    }),
  ] as const;
  const table = useTableModel({
    items: presentations,
    id: (item) => `${item.pointOfSaleNumber}:${item.fortnight.start}`,
    columns,
  });
  const blocked = presentations.filter(({ state }) => state === "blocked");

  return (
    <section className="flex flex-col gap-3">
      {blocked.map((item) => (
        <InlineNotice
          key={`${item.pointOfSaleNumber}:${item.fortnight.start}`}
          tone="error"
          icon={<TriangleAlert />}
          title={`${registerNameOf(item.registerId)} todavía no terminó de sincronizar`}
          description={`El informe ${formatCalendarDayRange(item.fortnight.start, item.fortnight.end)} del punto de venta ${formatPointOfSaleNumber(item.pointOfSaleNumber)} se puede presentar cuando termine.`}
        />
      ))}
      <Table
        aria-label="Informes quincenales"
        table={table}
        {...cloudTableState(data, "los informes quincenales")}
        empty={{
          icon: <FileText />,
          title: "Todavía no hay informes quincenales",
          description: "Aparecen cuando cierra la primera quincena con un punto de venta CAEA.",
          variant: "blank",
        }}
      />
    </section>
  );
}
