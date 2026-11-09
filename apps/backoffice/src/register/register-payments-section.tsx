import { Button } from "@purosur/ui";
import { CreditCard, QrCode } from "lucide-react";
import type { RegisterPaymentsSectionProps } from "../platform/register-panel-sections";

export function RegisterPaymentsSection({
  register,
  mayAssignPointTerminal,
  mayAssignQrPointOfSale,
  onAssignPointTerminal,
  onAssignQrPointOfSale,
  pointOfSaleSlot,
}: RegisterPaymentsSectionProps) {
  return (
    <div className="flex flex-col gap-4 pt-4">
      {pointOfSaleSlot}
      <div className="flex flex-col items-start gap-2">
        <p className="text-body text-text">
          {`Terminal Point: ${register.pointTerminalId ?? "sin asignar"}`}
        </p>
        {mayAssignPointTerminal ? (
          <Button
            variant="secondary"
            size="small"
            icon={<CreditCard />}
            onPress={onAssignPointTerminal}
          >
            Asignar terminal Point
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col items-start gap-2">
        <p className="text-body text-text">
          {`QR de Mercado Pago: ${register.qrExternalPosId ?? "sin asignar"}`}
        </p>
        {mayAssignQrPointOfSale ? (
          <Button
            variant="secondary"
            size="small"
            icon={<QrCode />}
            onPress={onAssignQrPointOfSale}
          >
            Asignar QR de Mercado Pago
          </Button>
        ) : null}
      </div>
    </div>
  );
}
