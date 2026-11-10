import type { OpenSale } from "@purosur/contracts";
import type { LoadStatus } from "@purosur/ui";
import {
  Button,
  FigureStat,
  formatCents,
  formatNumber,
  InlineNotice,
  KeyTile,
  LoadingPlaceholder,
  plural,
  SidePanel,
  SummaryRowGroup,
} from "@purosur/ui";
import {
  BadgePercent,
  Banknote,
  ChevronRight,
  CreditCard,
  Lock,
  OctagonAlert,
  QrCode,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { KeyedChargeMethod } from "./charge-method-options";
import { PaidOrderNotice } from "./rebuilt-paid-order-notice";
import { saleDiscountLabel } from "./sale-discount-text";

export type PaymentPanelProps = {
  saleStatus: LoadStatus;
  lineCount: number;
  grossSubtotal: number;
  promotionSavings: number;
  saleDiscount: OpenSale["sale_discount"];
  total: number;
  paid: number;
  pending: number;
  cancellable: boolean;
  hasApprovedPayment: boolean;
  chargeRefusal: OpenSale["charge_refusal"];
  paidOrderToApply:
    | Pick<NonNullable<OpenSale["rebuilt_paid_order"]>, "method" | "amount">
    | undefined;
  canCharge: boolean;
  canCancel: boolean;
  canDiscount: boolean;
  onDiscount: () => void;
  onCharge: (method: KeyedChargeMethod | undefined) => void;
  onChargePaidOrder: () => void;
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
  saleStatus,
  lineCount,
  grossSubtotal,
  promotionSavings,
  saleDiscount,
  total,
  paid,
  pending,
  cancellable,
  hasApprovedPayment,
  chargeRefusal,
  paidOrderToApply,
  canCharge,
  canCancel,
  canDiscount,
  onDiscount,
  onCharge,
  onChargePaidOrder,
  onCancel,
}: PaymentPanelProps) {
  const isZeroTotal = lineCount > 0 && total === 0;
  return (
    <SidePanel
      label="Panel de cobro"
      footer={
        cancellable && lineCount > 0 ? (
          <Button
            variant="secondary"
            destructive
            fullWidth
            icon={<X />}
            disabled={!canCancel}
            onPress={onCancel}
          >
            {hasApprovedPayment ? "Cancelar venta" : "Vaciar"}
          </Button>
        ) : undefined
      }
    >
      <FigureStat label="Total" value={formatCents(total)} />
      {saleStatus === "loading" ? <LoadingPlaceholder variant="card" lines={2} /> : null}
      {saleStatus === "loaded" ? (
        <SummaryRowGroup
          rows={[
            { label: "Artículos", value: formatNumber(lineCount) },
            ...(promotionSavings > 0 || saleDiscount !== null
              ? [
                  {
                    label: `${formatNumber(lineCount)} ${plural(lineCount, { one: "línea", other: "líneas" })}`,
                    value: formatCents(grossSubtotal),
                  },
                ]
              : []),
            ...(promotionSavings > 0
              ? [
                  {
                    label: "Ahorro en promociones",
                    value: `− ${formatCents(promotionSavings)}`,
                    saving: true,
                  },
                ]
              : []),
            saleDiscount === null
              ? { label: "Descuento sobre el total", value: "Sin aplicar" }
              : {
                  label: saleDiscountLabel(saleDiscount),
                  value: `− ${formatCents(saleDiscount.amount)}`,
                  tone: "error",
                },
          ]}
        />
      ) : null}
      {saleStatus === "loaded" ? (
        <Button
          variant="secondary"
          fullWidth
          icon={<BadgePercent />}
          disabled={!canDiscount}
          onPress={onDiscount}
        >
          Aplicar descuento al total
        </Button>
      ) : null}
      {paid === 0 ? null : (
        <SummaryRowGroup
          rows={[
            { label: "Pagado", value: formatCents(paid) },
            { label: "Saldo pendiente", value: formatCents(pending), strong: true },
          ]}
        />
      )}
      {chargeRefusal === null ? null : refusalNotice(chargeRefusal)}
      {isZeroTotal ? (
        <InlineNotice
          tone="warning"
          icon={<TriangleAlert />}
          title="El total es $ 0,00: quitá el producto o cancelá la venta."
        />
      ) : null}
      {paidOrderToApply === undefined ? null : <PaidOrderNotice paidOrder={paidOrderToApply} />}
      <div className="mt-auto flex flex-col gap-3">
        {paidOrderToApply === undefined ? (
          <>
            {chargeRefusal === null ? (
              <Button
                size="sale"
                fullWidth
                icon={<Banknote />}
                keycap="F12"
                disabled={!canCharge}
                onPress={() => onCharge("CASH")}
              >
                Cobrar en efectivo
              </Button>
            ) : (
              <Button size="sale" fullWidth icon={<Lock />} disabled onPress={() => {}}>
                Cobro no habilitado
              </Button>
            )}
            <div className="grid grid-cols-3 gap-3">
              <KeyTile
                label="Point débito"
                icon={<CreditCard />}
                keyName="F9"
                disabled={!canCharge}
                onPress={() => onCharge("POINT_DEBIT")}
              />
              <KeyTile
                label="Point crédito"
                icon={<CreditCard />}
                keyName="F10"
                disabled={!canCharge}
                onPress={() => onCharge("POINT_CREDIT")}
              />
              <KeyTile
                label="QR"
                icon={<QrCode />}
                keyName="F11"
                disabled={!canCharge}
                onPress={() => onCharge("QR")}
              />
            </div>
            <Button
              variant="text"
              icon={<ChevronRight />}
              keycap="F1"
              disabled={!canCharge}
              onPress={() => onCharge(undefined)}
            >
              Otros medios
            </Button>
          </>
        ) : (
          <Button size="large" fullWidth keycap="Enter" onPress={onChargePaidOrder}>
            Cobrar con el pago de Mercado Pago
          </Button>
        )}
      </div>
    </SidePanel>
  );
}
