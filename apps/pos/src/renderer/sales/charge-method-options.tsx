import type { PaymentMethodAvailability } from "@purosur/contracts";
import type { Icon, Options } from "@purosur/ui";
import { Banknote, Calculator, CreditCard, Landmark, QrCode, WifiOff } from "lucide-react";
import type { CoreData } from "../platform/use-core-query";

export type ChargeMethod =
  | "CASH"
  | "POINT_DEBIT"
  | "POINT_CREDIT"
  | "QR"
  | "TRANSFER"
  | "STANDALONE_TERMINAL";

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

const POINT_OPTIONS = [
  { value: "POINT_DEBIT", label: "Point · Débito" },
  { value: "POINT_CREDIT", label: "Point · Crédito" },
] as const;

function pointOptions(point: PaymentMethodAvailability["point"]): MethodOption[] {
  const base = {
    description: "Tarjeta en la terminal · requiere internet",
    icon: <CreditCard />,
  };
  switch (point) {
    case "available":
      return POINT_OPTIONS.map((option) => ({ ...base, ...option }));
    case "offline":
      return POINT_OPTIONS.map((option) => ({
        ...base,
        ...option,
        description: "No disponible sin conexión",
        icon: <WifiOff />,
        disabled: true,
      }));
    case "not_configured":
      return POINT_OPTIONS.map((option) => ({
        ...base,
        ...option,
        description: "No configurada en esta caja",
        disabled: true,
      }));
    case "below_minimum":
      return [];
  }
}

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

const QR_OPTION_NOT_CONFIGURED: MethodOption = {
  ...QR_OPTION,
  description: "No configurado en esta caja",
  disabled: true,
};

const TRANSFER_OPTION: MethodOption = {
  value: "TRANSFER",
  label: "Transferencia",
  description: "Confirmás al ver el ingreso en la cuenta del negocio",
  icon: <Landmark />,
};

const STANDALONE_TERMINAL_OPTION: MethodOption = {
  value: "STANDALONE_TERMINAL",
  label: "Terminal independiente",
  description: "Segunda Point · cargás el resultado a mano",
  icon: <Calculator />,
};

function qrOption(qr: PaymentMethodAvailability["qr"]): MethodOption {
  switch (qr) {
    case "available":
      return QR_OPTION;
    case "offline":
      return QR_OPTION_OFFLINE;
    case "not_configured":
      return QR_OPTION_NOT_CONFIGURED;
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
    return {
      options: [CASH_OPTION, TRANSFER_OPTION, STANDALONE_TERMINAL_OPTION],
      belowMinimum: undefined,
    };
  }
  const { qr, point, point_minimum: minimum } = availability.value;
  return {
    options: [
      CASH_OPTION,
      ...pointOptions(point),
      qrOption(qr),
      TRANSFER_OPTION,
      STANDALONE_TERMINAL_OPTION,
    ],
    belowMinimum: point === "below_minimum" ? minimum : undefined,
  };
}
