import type { RowMenuActions } from "@purosur/ui";
import { Ban, CreditCard, KeyRound, KeySquare, QrCode, Upload } from "lucide-react";
import {
  type BackofficeAccess,
  canAssignPointTerminal,
  canAssignQrPointOfSale,
  canEnrollRegisters,
  canRevokeInstallations,
  canUseBitlockerRecoveryKey,
} from "../shell/backoffice-access";
import type { RegisterActions } from "./register-action-modals";
import type { RegisterSummary } from "./registers-api";

export function registerRowActions(access: BackofficeAccess, actions: RegisterActions) {
  const emitAction = (item: RegisterSummary) =>
    canEnrollRegisters(access)
      ? {
          icon: <KeySquare />,
          "aria-label": `Emitir código de alta para ${item.name}`,
          onPress: () => actions.emitCode(item),
        }
      : undefined;
  const revokeAction = (item: RegisterSummary) =>
    item.installation?.state === "enrolled"
      ? {
          icon: <Ban />,
          "aria-label": `Revocar por pérdida o robo la caja ${item.name}`,
          onPress: () => actions.revoke(item),
        }
      : undefined;
  const mayUseKey = canUseBitlockerRecoveryKey(access);
  const bitlockerKeyAction = (item: RegisterSummary) => {
    if (!mayUseKey || item.installation?.state !== "enrolled") {
      return undefined;
    }
    return item.installation.bitlockerKeyLoaded
      ? {
          icon: <KeyRound />,
          "aria-label": `Consultar la clave de recuperación de BitLocker de ${item.name}`,
          onPress: () => actions.consultKey(item),
        }
      : {
          icon: <Upload />,
          "aria-label": `Cargar la clave de recuperación de BitLocker de ${item.name}`,
          onPress: () => actions.loadKey(item),
        };
  };

  const inline = canRevokeInstallations(access)
    ? ([bitlockerKeyAction, revokeAction, emitAction] as const)
    : ([bitlockerKeyAction, emitAction] as const);

  const mayAssignTerminal = canAssignPointTerminal(access);
  const mayAssignQr = canAssignQrPointOfSale(access);
  if (!mayAssignTerminal && !mayAssignQr) {
    return { actions: inline };
  }
  const menu = (item: RegisterSummary): RowMenuActions | undefined => {
    const entries = [
      ...(mayAssignTerminal
        ? [
            {
              label: "Asignar terminal Point",
              icon: <CreditCard />,
              onAction: () => actions.assignTerminal(item),
            },
          ]
        : []),
      ...(mayAssignQr
        ? [
            {
              label: "Asignar QR de Mercado Pago",
              icon: <QrCode />,
              onAction: () => actions.assignQr(item),
            },
          ]
        : []),
    ];
    const [first, ...others] = entries;
    return first === undefined ? undefined : [first, ...others];
  };
  return { actions: inline, menu };
}
