import type { InitialCountLine } from "@purosur/contracts";
import {
  Button,
  Eyebrow,
  FigureStat,
  formatNumber,
  LoadingPlaceholder,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
} from "@purosur/ui";
import { Check, Package } from "lucide-react";
import type { CoreData } from "../platform/use-core-query";
import { linesText, summaryOf } from "./initial-count-text";

const EYEBROW = "Cargado hasta ahora";

export type InitialCountSummaryPanelProps = {
  state: CoreData<InitialCountLine[]>;
  onFinish: () => void;
  onClose: () => void;
};

function Totals({ lines }: { lines: readonly InitialCountLine[] }) {
  const summary = summaryOf(lines);
  return (
    <>
      <FigureStat label={EYEBROW} size="hero" value={linesText(summary.lines)} />
      <SummaryRowGroup
        rows={[
          { label: "Productos distintos", value: formatNumber(summary.products) },
          { label: "Con vencimiento", value: formatNumber(summary.withExpiry) },
          { label: "Sin vencimiento", value: formatNumber(summary.withoutExpiry) },
        ]}
      />
    </>
  );
}

export function InitialCountSummaryPanel({
  state,
  onFinish,
  onClose,
}: InitialCountSummaryPanelProps) {
  return (
    <SidePanel
      width="wide"
      label="Resumen del inventario"
      header={
        <SidePanelTitle
          icon={<Package />}
          title="Inventario inicial"
          onClose={onClose}
        />
      }
      footer={
        <Button
          size="large"
          fullWidth
          icon={<Check />}
          iconPosition="start"
          keycap="F12"
          onPress={onFinish}
        >
          Terminar la carga
        </Button>
      }
    >
      {state.status === "loaded" ? <Totals lines={state.value} /> : null}
      {state.status === "loading" ? (
        <>
          <FigureStat label={EYEBROW} size="hero" loading />
          <LoadingPlaceholder variant="card" lines={3} />
        </>
      ) : null}
      {state.status === "failed" ? <Eyebrow text={EYEBROW} /> : null}
    </SidePanel>
  );
}
