import type { Icon, KeyName } from "@purosur/ui";
import {
  Button,
  FigureStat,
  formatCents,
  InlineNotice,
  KeyTile,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import { Banknote, ChevronRight, CreditCard, Info, QrCode } from "lucide-react";
import type { ReactNode } from "react";
import { useKeys } from "../platform/key-layer";
import type { ChargeMethodAvailability, KeyedChargeMethod } from "./charge-method-availability";

export type CombinedPaymentPanelProps = {
  total: number;
  paid: number;
  pending: number;
  methods: ChargeMethodAvailability;
  cancelledNotice: boolean;
  paidOrderNotice: ReactNode;
  onChoose: (method: KeyedChargeMethod) => void;
  onChooseOther: () => void;
};

const TILES: { method: KeyedChargeMethod; label: string; icon: Icon; keyName: KeyName }[] = [
  { method: "POINT_DEBIT", label: "Point débito", icon: <CreditCard />, keyName: "F9" },
  { method: "POINT_CREDIT", label: "Point crédito", icon: <CreditCard />, keyName: "F10" },
  { method: "QR", label: "QR", icon: <QrCode />, keyName: "F11" },
];

export function CombinedPaymentPanel({
  total,
  paid,
  pending,
  methods,
  cancelledNotice,
  paidOrderNotice,
  onChoose,
  onChooseOther,
}: CombinedPaymentPanelProps) {
  const offered = (method: KeyedChargeMethod) => methods[method]?.kind === "offered";
  useKeys([
    { key: "F12", run: () => onChoose("CASH"), enabled: offered("CASH") },
    { key: "F9", run: () => onChoose("POINT_DEBIT"), enabled: offered("POINT_DEBIT") },
    { key: "F10", run: () => onChoose("POINT_CREDIT"), enabled: offered("POINT_CREDIT") },
    { key: "F11", run: () => onChoose("QR"), enabled: offered("QR") },
    { key: "F1", run: onChooseOther },
  ]);

  return (
    <SidePanel label="Panel de cobro" width="wide">
      <FigureStat size="hero" label="FALTA" value={formatCents(pending)} />
      <SummaryRowGroup
        variant="plain"
        rows={[
          { label: "Total", value: formatCents(total) },
          ...(paid > 0 ? [{ label: "Pagado", value: `– ${formatCents(paid)}` }] : []),
        ]}
      />
      {cancelledNotice ? (
        <InlineNotice tone="info" icon={<Info />} title="Se canceló la orden QR." />
      ) : null}
      {paidOrderNotice}
      <div className="mt-auto flex flex-col gap-3">
        <Button
          size="sale"
          fullWidth
          icon={<Banknote />}
          iconPosition="start"
          keycap="F12"
          disabled={!offered("CASH")}
          onPress={() => onChoose("CASH")}
        >
          Cobrar en efectivo
        </Button>
        <div className="grid grid-cols-3 gap-3">
          {TILES.map(({ method, label, icon, keyName }) => {
            const state = methods[method];
            return state === undefined ? null : (
              <KeyTile
                key={method}
                label={label}
                icon={icon}
                keyName={keyName}
                {...(state.kind === "locked" ? { disabledReason: state.reason } : {})}
                onPress={() => onChoose(method)}
              />
            );
          })}
        </div>
        <Button variant="text" trailingIcon={<ChevronRight />} keycap="F1" onPress={onChooseOther}>
          Otros medios
        </Button>
      </div>
    </SidePanel>
  );
}
