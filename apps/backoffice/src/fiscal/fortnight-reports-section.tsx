import {
  actionsColumn,
  dataColumn,
  formatCalendarDayNumeric,
  formatCalendarDayRange,
  formatPointOfSaleNumber,
  InlineNotice,
  StatusIndicator,
  Table,
  useTableModel,
} from "@purosur/ui";
import { CircleAlert, FileSearch, FileText, TriangleAlert } from "lucide-react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { CloudData } from "../platform/use-cloud-query";
import {
  presentationDocumentsLabel,
  presentationDocumentTypeLabel,
  presentationStateBadge,
} from "./fortnight-presentation-labels";
import type { FortnightPresentation } from "./fortnight-presentations-api";
import type { RegisterPointOfSale } from "./register-points-of-sale-api";
import type { RemedyTarget } from "./rejected-document-remedy-form";

type FortnightReportsSectionProps = {
  data: CloudData<[FortnightPresentation[], RegisterPointOfSale[]]>;
  onReview: (target: RemedyTarget) => void;
};

const NO_PRESENTATIONS: FortnightPresentation[] = [];
const UNKNOWN_REGISTER = "Una caja";

function fortnightOf({ fortnight }: FortnightPresentation) {
  return formatCalendarDayRange(fortnight.start, fortnight.end);
}

function presentationKey(item: FortnightPresentation) {
  return `${item.pointOfSaleNumber}:${item.fortnight.start}:${item.documentType ?? "none"}`;
}

export function FortnightReportsSection({ data, onReview }: FortnightReportsSectionProps) {
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
      id: "documentType",
      header: "Tipo",
      render: (item: FortnightPresentation) => presentationDocumentTypeLabel(item.documentType),
    }),
    dataColumn({
      id: "documents",
      header: "Comprobantes",
      render: (item: FortnightPresentation) => presentationDocumentsLabel(item),
    }),
    dataColumn({
      id: "state",
      header: "Estado",
      render: (item: FortnightPresentation) => {
        const { label, tone } = presentationStateBadge(item);
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
    actionsColumn({
      id: "actions",
      header: "Acciones",
      actions: [
        (item: FortnightPresentation) => {
          const { rejectedDocument } = item;
          return rejectedDocument?.remedy === "awaiting_remedy"
            ? {
                icon: <FileSearch />,
                "aria-label": `Revisar el rechazo del informe ${fortnightOf(item)} del punto de venta ${formatPointOfSaleNumber(item.pointOfSaleNumber)}`,
                onPress: () =>
                  onReview({
                    pointOfSaleNumber: item.pointOfSaleNumber,
                    fortnight: item.fortnight,
                    rejectedDocument,
                  }),
              }
            : undefined;
        },
      ],
    }),
  ] as const;
  const table = useTableModel({
    items: presentations,
    id: presentationKey,
    columns,
  });
  const blocked = presentations.filter(({ state }) => state === "blocked");
  const awaitingRemedy = presentations.filter(
    ({ rejectedDocument }) => rejectedDocument?.remedy === "awaiting_remedy",
  );

  return (
    <section className="flex flex-col gap-3">
      {blocked.map((item) => (
        <InlineNotice
          key={presentationKey(item)}
          tone="error"
          icon={<TriangleAlert />}
          title={`${registerNameOf(item.registerId)} todavía no terminó de sincronizar`}
          description={`El informe ${formatCalendarDayRange(item.fortnight.start, item.fortnight.end)} del punto de venta ${formatPointOfSaleNumber(item.pointOfSaleNumber)} se puede presentar cuando termine.`}
        />
      ))}
      {awaitingRemedy.map((item) => (
        <InlineNotice
          key={presentationKey(item)}
          tone="error"
          icon={<CircleAlert />}
          title={`ARCA rechazó un comprobante del informe ${fortnightOf(item)} del punto de venta ${formatPointOfSaleNumber(item.pointOfSaleNumber)}`}
          description="Hay que revisar dónde está el error antes de volver a presentar."
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
