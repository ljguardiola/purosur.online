import type { InitialCountLine } from "@purosur/contracts";
import type { TableLoadingState } from "@purosur/ui";
import {
  actionsColumn,
  dataColumn,
  formatCalendarDayNumeric,
  Table,
  useTableModel,
} from "@purosur/ui";
import { Calendar, ClipboardList, Trash2, TriangleAlert } from "lucide-react";
import type { CoreData } from "../platform/use-core-query";
import { countedText, linesText } from "./initial-count-text";

export type InitialCountLinesProps = {
  state: CoreData<InitialCountLine[]>;
  onWithdraw: (line: InitialCountLine) => void;
};

function loadingOf(state: Exclude<CoreData<unknown>, { status: "failed" }>): TableLoadingState {
  if (state.status === "loading") {
    return "initial";
  }
  return state.refreshing ? "updating" : false;
}

function ExpiryCell({ expiresOn }: { expiresOn: string | null }) {
  return expiresOn === null ? (
    <span className="text-text-subtle">— Sin vencimiento</span>
  ) : (
    <span className="flex items-center gap-2">
      <Calendar aria-hidden="true" className="size-icon-md text-text-subtle" />
      {formatCalendarDayNumeric(expiresOn)}
    </span>
  );
}

export function InitialCountLines({ state, onWithdraw }: InitialCountLinesProps) {
  const lines = state.status === "loaded" ? state.value : [];
  const table = useTableModel({
    items: lines,
    id: (line) => line.movement_id,
    columns: [
      dataColumn({
        id: "product",
        header: "Producto",
        render: (line: InitialCountLine) => line.product_name,
      }),
      dataColumn({
        id: "expiry",
        header: "Vencimiento",
        render: (line: InitialCountLine) => <ExpiryCell expiresOn={line.expires_on} />,
      }),
      dataColumn({
        id: "counted",
        header: "Contado",
        align: "end",
        render: (line: InitialCountLine) => countedText(line),
      }),
      actionsColumn({
        id: "actions",
        header: "Acciones de la línea",
        actions: [
          (line: InitialCountLine) => ({
            icon: <Trash2 />,
            "aria-label": `Quitar ${line.product_name}`,
            onPress: () => onWithdraw(line),
          }),
        ],
      }),
    ] as const,
  });

  return (
    <Table
      aria-label="Líneas cargadas"
      table={table}
      {...(state.status === "failed"
        ? {
            failure: {
              icon: <TriangleAlert />,
              title: "No se pudo leer lo cargado",
              description: "Volvé a intentarlo en unos segundos.",
              onRetry: state.retry,
            },
          }
        : { loading: loadingOf(state) })}
      empty={{
        icon: <ClipboardList />,
        title: "Todavía no cargaste ninguna línea",
        description: "Escaneá un producto o buscalo por nombre para cargar la primera.",
        variant: "blank",
      }}
      footer={
        lines.length === 0 ? undefined : (
          <p className="text-detail text-text-subtle">{linesText(lines.length)}</p>
        )
      }
    />
  );
}
