import type { InitialCountLine } from "@purosur/contracts";
import type { Icon, KeyLegendItem, TableLoadingState } from "@purosur/ui";
import { dataColumn, formatCalendarDayNumeric, Table, useTableModel } from "@purosur/ui";
import { ClipboardList, TriangleAlert } from "lucide-react";
import type { CoreData } from "../platform/use-core-query";
import { countedText } from "./initial-count-text";

export type InitialCountLinesProps = {
  state: CoreData<InitialCountLine[]>;
  selectedLineId: string | undefined;
  legend: readonly KeyLegendItem[];
  onSelect: (line: InitialCountLine) => void;
  unavailable?: { icon: Icon; title: string };
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
    formatCalendarDayNumeric(expiresOn)
  );
}

export function InitialCountLines({
  state,
  selectedLineId,
  legend,
  onSelect,
  unavailable,
}: InitialCountLinesProps) {
  const lines = state.status === "loaded" && unavailable === undefined ? state.value : [];
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
    ] as const,
  });

  return (
    <Table
      aria-label="Líneas cargadas"
      table={table}
      fill
      emptyKeepsHeaders
      {...(legend.length === 0 ? {} : { legend })}
      rowState={(line) => (line.movement_id === selectedLineId ? "selected" : undefined)}
      onRowPress={onSelect}
      {...(state.status === "failed" && unavailable === undefined
        ? {
            failure: {
              icon: <TriangleAlert />,
              title: "No se pudo leer lo cargado",
              description: "Volvé a intentarlo en unos segundos.",
              onRetry: state.retry,
            },
          }
        : {
            loading:
              state.status === "failed" || unavailable !== undefined ? false : loadingOf(state),
          })}
      empty={{
        icon: unavailable === undefined ? <ClipboardList /> : unavailable.icon,
        title: unavailable === undefined ? "Todavía no cargaste ninguna línea" : unavailable.title,
        variant: "blank",
      }}
    />
  );
}
