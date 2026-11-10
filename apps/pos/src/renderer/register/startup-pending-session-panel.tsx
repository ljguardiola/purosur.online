import type { StartupPending } from "@purosur/contracts";
import {
  Button,
  FigureStat,
  formatCents,
  formatClockTime,
  InlineNotice,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import { ShoppingBasket, TriangleAlert, Wallet } from "lucide-react";
import type { SignedInPerson } from "../shell/signed-in-person";

const SELLING_BLOCKED_REASON = "Pasá el cobro a reembolso para empezar a vender.";
const CHECKING_REASON = "Esperá a que la caja termine de consultar los cobros pagados.";

export type StartupPendingSessionPanelProps = {
  sessionOwner: SignedInPerson;
  openedAt: string;
  openingFloat: number | undefined;
  keptFromSelling: StartupPending | undefined;
  onGoSelling: () => void;
};

function GoSelling({
  keptFromSelling,
  onGoSelling,
}: Pick<StartupPendingSessionPanelProps, "keptFromSelling" | "onGoSelling">) {
  if (keptFromSelling === undefined) {
    return (
      <Button size="sale" fullWidth icon={<ShoppingBasket />} keycap="Enter" onPress={onGoSelling}>
        Ir a vender
      </Button>
    );
  }
  if (keptFromSelling.selling_blocked) {
    return (
      <>
        <InlineNotice tone="warning" icon={<TriangleAlert />} title={SELLING_BLOCKED_REASON} />
        <Button size="sale" fullWidth icon={<ShoppingBasket />} keycap="Enter" disabled>
          Ir a vender
        </Button>
      </>
    );
  }
  return (
    <Button
      size="sale"
      fullWidth
      icon={<ShoppingBasket />}
      keycap="Enter"
      disabledReason={CHECKING_REASON}
    >
      Ir a vender
    </Button>
  );
}

export function StartupPendingSessionPanel({
  sessionOwner,
  openedAt,
  openingFloat,
  keptFromSelling,
  onGoSelling,
}: StartupPendingSessionPanelProps) {
  const since = { label: "Desde las", value: formatClockTime(openedAt) };
  return (
    <SidePanel
      label="Sesión abierta"
      footer={<GoSelling keptFromSelling={keptFromSelling} onGoSelling={onGoSelling} />}
    >
      <p className="flex items-center gap-3 text-subheading font-bold text-text">
        <span
          aria-hidden="true"
          className="flex size-control-sm shrink-0 items-center justify-center rounded-full bg-surface-soft text-text-eyebrow *:size-icon-md"
        >
          <Wallet />
        </span>
        Sesión abierta
      </p>
      <FigureStat label="Abierta por" value={sessionOwner.first_name} />
      <SummaryRowGroup
        variant="plain"
        rows={
          openingFloat === undefined
            ? [since]
            : [since, { label: "Fondo inicial", value: formatCents(openingFloat) }]
        }
      />
    </SidePanel>
  );
}
