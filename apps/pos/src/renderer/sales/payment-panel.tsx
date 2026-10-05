import type { OpenSale } from "@purosur/contracts";
import {
  Button,
  FigureStat,
  formatCents,
  InlineNotice,
  plural,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import { Banknote, Lock, OctagonAlert, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";

export type PaymentPanelProps = {
  lineCount: number;
  total: number;
  chargeRefusal: OpenSale["charge_refusal"];
  canCancel: boolean;
  onCharge: () => void;
  onCancel: () => void;
};

function refusalNotice(refusal: NonNullable<OpenSale["charge_refusal"]>): ReactNode {
  const { title, description } =
    refusal.kind === "reaches_buyer_identification_threshold"
      ? {
          title: "Llegaste al tope de venta",
          description: `El total no puede ser igual o mayor a ${formatCents(refusal.threshold)}. Quitá productos o bajá cantidades para poder cobrar.`,
        }
      : {
          title: "Falta el tope de venta",
          description:
            "La caja todavía no recibió el tope de venta sin identificar al comprador. Esperá a que se sincronice para poder cobrar.",
        };
  return (
    <InlineNotice tone="error" icon={<OctagonAlert />} title={title} description={description} />
  );
}

export function PaymentPanel({
  lineCount,
  total,
  chargeRefusal,
  canCancel,
  onCharge,
  onCancel,
}: PaymentPanelProps) {
  const lines = plural(lineCount, { one: "línea", other: "líneas" });
  const isZeroTotal = lineCount > 0 && total === 0;
  return (
    <SidePanel
      label="Panel de cobro"
      footer={
        <Button
          variant="secondary"
          destructive
          fullWidth
          icon={<X />}
          disabled={!canCancel}
          onPress={onCancel}
        >
          Cancelar venta
        </Button>
      }
    >
      <FigureStat label="Total a cobrar" value={formatCents(total)} />
      <SummaryRowGroup rows={[{ label: `${lineCount} ${lines}`, value: formatCents(total) }]} />
      {chargeRefusal === null ? null : refusalNotice(chargeRefusal)}
      {chargeRefusal === null ? (
        <Button
          size="sale"
          fullWidth
          icon={<Banknote />}
          disabled={lineCount === 0 || isZeroTotal}
          onPress={onCharge}
        >
          Cobrar
        </Button>
      ) : (
        <Button size="sale" fullWidth icon={<Lock />} disabled onPress={onCharge}>
          Cobro no habilitado
        </Button>
      )}
      {isZeroTotal ? (
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="El total es $ 0,00: quitá el producto o cancelá la venta."
        />
      ) : null}
    </SidePanel>
  );
}
