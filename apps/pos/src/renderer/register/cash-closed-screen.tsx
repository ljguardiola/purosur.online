import {
  Button,
  FigureStat,
  formatCents,
  formatDayMonthAndTime,
  SidePanel,
  SidePanelTitle,
  SummaryRowGroup,
} from "@purosur/ui";
import { Check, LogOut } from "lucide-react";
import { useKeys } from "../platform/key-layer";
import { OpenSessionRail } from "../shell/open-session-rail";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import { closedDifferenceText } from "./cash-amounts";
import { CashMovementsTable } from "./cash-movements-table";
import type { ClosedCashSummary } from "./closed-cash-summary";

export type CashClosedScreenProps = {
  person: SignedInPerson;
  summary: ClosedCashSummary;
  lock: () => void;
  onOpenCash: () => void;
};

export function CashClosedScreen({ person, summary, lock, onOpenCash }: CashClosedScreenProps) {
  const { session, movements } = summary;

  useKeys([
    { key: "F12", run: onOpenCash },
    { key: "Escape", run: onOpenCash },
  ]);
  useKeys([{ key: "Enter", run: lock }], { fallback: true });

  return (
    <RegisterFrame
      background="surface"
      rail={
        <OpenSessionRail lock={lock} current="cash" abilities={person.abilities} sessionClosed />
      }
      aside={
        <SidePanel
          width="wide"
          label="Caja cerrada"
          header={<SidePanelTitle icon={<Check />} title="Caja cerrada" onClose={onOpenCash} />}
          footer={
            <>
              <div className="flex">
                <Button variant="text" keycap="F12" onPress={onOpenCash}>
                  Abrir caja
                </Button>
              </div>
              <Button
                size="large"
                fullWidth
                icon={<LogOut />}
                iconPosition="start"
                keycap="Enter"
                onPress={lock}
              >
                Salir
              </Button>
            </>
          }
        >
          <FigureStat size="hero" label="CONTADO" value={formatCents(session.counted_cash)} />
          <SummaryRowGroup
            rows={[
              { label: "Efectivo esperado", value: formatCents(session.expected_cash) },
              { label: "Diferencia", value: closedDifferenceText(session.difference) },
              { label: "Abierta", value: formatDayMonthAndTime(session.opened_at) },
              { label: "Cerrada", value: formatDayMonthAndTime(session.closed_at) },
            ]}
          />
        </SidePanel>
      }
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <h1 className="sr-only">Movimientos de efectivo</h1>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <CashMovementsTable
            state={{ status: "loaded", value: movements, refreshing: false }}
            legend={[]}
            locked
          />
        </div>
      </main>
    </RegisterFrame>
  );
}
