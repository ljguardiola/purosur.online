import type { InitialCountLine } from "@purosur/contracts";
import {
  Button,
  Eyebrow,
  FigureStat,
  formatNumber,
  LoadingPlaceholder,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import type { CoreData } from "../platform/use-core-query";
import { linesText, summaryOf } from "./initial-count-text";

const EYEBROW = "Cargado hasta ahora";

export type InitialCountSummaryPanelProps = {
  state: CoreData<InitialCountLine[]>;
  onFinish: () => void;
};

function Totals({ lines }: { lines: readonly InitialCountLine[] }) {
  const summary = summaryOf(lines);
  return (
    <>
      <FigureStat label={EYEBROW} size="heading" value={linesText(summary.lines)} />
      <SummaryRowGroup
        rows={[
          { label: "Productos distintos", value: formatNumber(summary.products) },
          { label: "Con vencimiento", value: linesText(summary.withExpiry) },
          { label: "Sin vencimiento", value: linesText(summary.withoutExpiry) },
        ]}
      />
    </>
  );
}

export function InitialCountSummaryPanel({ state, onFinish }: InitialCountSummaryPanelProps) {
  return (
    <SidePanel
      footer={
        <Button size="large" fullWidth onPress={onFinish}>
          Terminar la carga
        </Button>
      }
    >
      {state.status === "loaded" ? <Totals lines={state.value} /> : null}
      {state.status === "loading" ? (
        <>
          <FigureStat label={EYEBROW} size="heading" loading />
          <LoadingPlaceholder variant="card" lines={3} />
        </>
      ) : null}
      {state.status === "failed" ? <Eyebrow text={EYEBROW} /> : null}
    </SidePanel>
  );
}
