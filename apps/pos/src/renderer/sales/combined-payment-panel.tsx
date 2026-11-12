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
import type { ChargeMethod, KeyedChargeMethod } from "./charge-method-options";

export type CombinedPaymentPanelProps = {
  total: number;
  paid: number;
  pending: number;
  enabled: ReadonlySet<ChargeMethod>;
  belowMinimum: number | undefined;
  cancelledNotice: boolean;
  paidOrderNotice: ReactNode;
  onChoose: (method: KeyedChargeMethod) => void;
  onChooseOther: () => void;
};

export function CombinedPaymentPanel({
  total,
  paid,
  pending,
  enabled,
  belowMinimum,
  cancelledNotice,
  paidOrderNotice,
  onChoose,
  onChooseOther,
}: CombinedPaymentPanelProps) {
  useKeys([
    { key: "F12", run: () => onChoose("CASH"), enabled: enabled.has("CASH") },
    { key: "F9", run: () => onChoose("POINT_DEBIT"), enabled: enabled.has("POINT_DEBIT") },
    { key: "F10", run: () => onChoose("POINT_CREDIT"), enabled: enabled.has("POINT_CREDIT") },
    { key: "F11", run: () => onChoose("QR"), enabled: enabled.has("QR") },
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
      {belowMinimum === undefined ? null : (
        <InlineNotice
          tone="info"
          icon={<Info />}
          title={`Point: no se ofrece para cobrar menos de ${formatCents(belowMinimum)}`}
        />
      )}
      <div className="mt-auto flex flex-col gap-3">
        <Button
          size="sale"
          fullWidth
          icon={<Banknote />}
          iconPosition="start"
          keycap="F12"
          disabled={!enabled.has("CASH")}
          onPress={() => onChoose("CASH")}
        >
          Cobrar en efectivo
        </Button>
        <div className="grid grid-cols-3 gap-3">
          <KeyTile
            label="Point débito"
            icon={<CreditCard />}
            keyName="F9"
            disabled={!enabled.has("POINT_DEBIT")}
            onPress={() => onChoose("POINT_DEBIT")}
          />
          <KeyTile
            label="Point crédito"
            icon={<CreditCard />}
            keyName="F10"
            disabled={!enabled.has("POINT_CREDIT")}
            onPress={() => onChoose("POINT_CREDIT")}
          />
          <KeyTile
            label="QR"
            icon={<QrCode />}
            keyName="F11"
            disabled={!enabled.has("QR")}
            onPress={() => onChoose("QR")}
          />
        </div>
        <Button variant="text" trailingIcon={<ChevronRight />} keycap="F1" onPress={onChooseOther}>
          Otros medios
        </Button>
      </div>
    </SidePanel>
  );
}
