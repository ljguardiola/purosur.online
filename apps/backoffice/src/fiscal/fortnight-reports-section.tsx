import {
  dataColumn,
  formatCalendarDayNumeric,
  formatPointOfSaleNumber,
  InlineNotice,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { FileText, TriangleAlert } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import {
  fortnightLabel,
  fortnightShortLabel,
  presentationStateBadge,
} from "./fortnight-presentation-labels";
import type { FortnightPresentation } from "./fortnight-presentations-api";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";

type FortnightReportsSectionProps = {
  data: CloudData<[FortnightPresentation[], RegisterPointOfSale[]]>;
};

const NO_PRESENTATIONS: FortnightPresentation[] = [];
const UNKNOWN_REGISTER = "Una caja";

function vouchersText(presentation: FortnightPresentation, registerName: string): string {
  if (presentation.state === "accepted") {
    return "Sin movimiento";
  }
  return presentation.state === "blocked" ? `Faltan comprobantes de ${registerName}` : "—";
}

export function FortnightReportsSection({ data }: FortnightReportsSectionProps) {
  const [presentations, registers] = data.status === "loaded" ? data.value : [NO_PRESENTATIONS, []];
  const registerNameOf = (registerId: string) =>
    registers.find((register) => register.registerId === registerId)?.registerName ??
    UNKNOWN_REGISTER;
  const columns = [
    dataColumn({
      id: "fortnight",
      header: "Quincena",
      render: (item: FortnightPresentation) => fortnightLabel(item.fortnight),
    }),
    dataColumn({
      id: "pointOfSale",
      header: "Punto de venta",
      render: (item: FortnightPresentation) => formatPointOfSaleNumber(item.pointOfSaleNumber),
    }),
    dataColumn({
      id: "vouchers",
      header: "Comprobantes",
      render: (item: FortnightPresentation) => vouchersText(item, registerNameOf(item.registerId)),
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
          title={`No se puede presentar el informe del ${fortnightShortLabel(item.fortnight)}`}
          description={`${registerNameOf(item.registerId)} estuvo sin conexión y la nube todavía no tiene todos sus comprobantes de esa quincena. Se puede presentar cuando termine de sincronizar.`}
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
