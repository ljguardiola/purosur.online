import type { PaymentMethodAvailability } from "@purosur/contracts";
import type { Icon, Options } from "@purosur/ui";
import { Banknote, CreditCard, Landmark, QrCode, WifiOff } from "lucide-react";
import type { CoreData } from "../platform/use-core-query";

export type ChargeMethod = "CASH" | "POINT" | "QR" | "TRANSFER";

type MethodOption = {
  value: ChargeMethod;
  label: string;
  description: string;
  icon: Icon;
  disabled?: true;
};

const CASH_OPTION: MethodOption = {
  value: "CASH",
  label: "Efectivo",
  description: "Cargás lo entregado y ves el vuelto",
  icon: <Banknote />,
};

const POINT_OPTION: MethodOption = {
  value: "POINT",
  label: "Point integrada",
  description: "Débito o crédito en la terminal · requiere internet",
  icon: <CreditCard />,
};

const POINT_OPTION_OFFLINE: MethodOption = {
  ...POINT_OPTION,
  description: "No disponible sin conexión",
  icon: <WifiOff />,
  disabled: true,
};

const POINT_OPTION_NOT_CONFIGURED: MethodOption = {
  ...POINT_OPTION,
  description: "No configurada en esta caja",
  disabled: true,
};

const QR_OPTION: MethodOption = {
  value: "QR",
  label: "QR de Mercado Pago",
  description: "El cliente escanea el QR · requiere internet",
  icon: <QrCode />,
};

const QR_OPTION_OFFLINE: MethodOption = {
  ...QR_OPTION,
  description: "No disponible sin conexión",
  icon: <WifiOff />,
  disabled: true,
};

const TRANSFER_OPTION: MethodOption = {
  value: "TRANSFER",
  label: "Transferencia",
  description: "Confirmás al ver el ingreso en la cuenta del negocio",
  icon: <Landmark />,
};

function pointOption(point: PaymentMethodAvailability["point"]): MethodOption | undefined {
  switch (point) {
    case "available":
      return POINT_OPTION;
    case "offline":
      return POINT_OPTION_OFFLINE;
    case "not_configured":
      return POINT_OPTION_NOT_CONFIGURED;
    case "below_minimum":
      return undefined;
  }
}

export type ChargeMethodOptions = {
  options: Options<MethodOption>;
  belowMinimum: number | undefined;
};

export function chargeMethodOptions(
  availability: CoreData<PaymentMethodAvailability>,
): ChargeMethodOptions {
  if (availability.status !== "loaded") {
    return { options: [CASH_OPTION, TRANSFER_OPTION], belowMinimum: undefined };
  }
  const { qr, point, point_minimum: minimum } = availability.value;
  const terminal = pointOption(point);
  return {
    options: [
      CASH_OPTION,
      ...(terminal === undefined ? [] : [terminal]),
      qr === "available" ? QR_OPTION : QR_OPTION_OFFLINE,
      TRANSFER_OPTION,
    ],
    belowMinimum: point === "below_minimum" ? minimum : undefined,
  };
}
