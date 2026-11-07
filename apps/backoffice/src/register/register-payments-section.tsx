import { Button } from "@purosur/ui";
import { CreditCard, QrCode } from "lucide-react";
import type { ReactNode } from "react";
import {
  type BackofficeAccess,
  canAssignPointTerminal,
  canAssignQrPointOfSale,
} from "../shell/backoffice-access";
import type { RegisterActions } from "./register-row-actions";
import type { RegisterSummary } from "./registers-api";

export type RegisterPaymentsSectionProps = {
  register: RegisterSummary;
  access: BackofficeAccess;
  actions: RegisterActions;
  pointOfSaleSlot?: ReactNode | undefined;
};

export function RegisterPaymentsSection({
  register,
  access,
  actions,
  pointOfSaleSlot,
}: RegisterPaymentsSectionProps) {
  return (
    <div className="flex flex-col gap-4 pt-4">
      {pointOfSaleSlot}
      <div className="flex flex-col items-start gap-2">
        <p className="text-body text-text">
          {`Terminal Point: ${register.pointTerminalId ?? "sin asignar"}`}
        </p>
        {canAssignPointTerminal(access) && (
          <Button
            variant="secondary"
            size="small"
            icon={<CreditCard />}
            onPress={() => actions.assignTerminal(register)}
          >
            Asignar terminal Point
          </Button>
        )}
      </div>
      <div className="flex flex-col items-start gap-2">
        <p className="text-body text-text">
          {`QR de Mercado Pago: ${register.qrExternalPosId ?? "sin asignar"}`}
        </p>
        {canAssignQrPointOfSale(access) && (
          <Button
            variant="secondary"
            size="small"
            icon={<QrCode />}
            onPress={() => actions.assignQr(register)}
          >
            Asignar QR de Mercado Pago
          </Button>
        )}
      </div>
    </div>
  );
}
