import type { Icon, RowMenuAction, RowMenuActions, TableAction, TableActions } from "@purosur/ui";
import { Ban, CreditCard, KeyRound, KeySquare, QrCode, Upload } from "lucide-react";
import {
  type BackofficeAccess,
  canAssignPointTerminal,
  canAssignQrPointOfSale,
  canEnrollRegisters,
  canRevokeInstallations,
  canUseBitlockerRecoveryKey,
} from "../shell/backoffice-access";
import type { RegisterSummary } from "./registers-api";

export type RegisterActions = {
  emitCode: (register: RegisterSummary) => void;
  revoke: (register: RegisterSummary) => void;
  loadKey: (register: RegisterSummary) => void;
  consultKey: (register: RegisterSummary) => void;
  assignTerminal: (register: RegisterSummary) => void;
  assignQr: (register: RegisterSummary) => void;
};

type RegisterRowAction = {
  icon: Icon;
  "aria-label": string;
  label: string;
  onPress: () => void;
};

const INLINE_ACTIONS = 3;

export function registerRowActions(access: BackofficeAccess, actions: RegisterActions) {
  const mayUseKey = canUseBitlockerRecoveryKey(access);
  const mayRevoke = canRevokeInstallations(access);
  const mayEnroll = canEnrollRegisters(access);
  const mayAssignTerminal = canAssignPointTerminal(access);
  const mayAssignQr = canAssignQrPointOfSale(access);

  function bitlockerKeyAction(item: RegisterSummary): RegisterRowAction | undefined {
    if (!mayUseKey || item.installation?.state !== "enrolled") {
      return undefined;
    }
    return item.installation.bitlockerKeyLoaded
      ? {
          icon: <KeyRound />,
          "aria-label": `Consultar la clave de recuperación de BitLocker de ${item.name}`,
          label: "Consultar la clave de recuperación de BitLocker",
          onPress: () => actions.consultKey(item),
        }
      : {
          icon: <Upload />,
          "aria-label": `Cargar la clave de recuperación de BitLocker de ${item.name}`,
          label: "Cargar la clave de recuperación de BitLocker",
          onPress: () => actions.loadKey(item),
        };
  }

  function revokeAction(item: RegisterSummary): RegisterRowAction | undefined {
    return mayRevoke && item.installation?.state === "enrolled"
      ? {
          icon: <Ban />,
          "aria-label": `Revocar por pérdida o robo la caja ${item.name}`,
          label: "Revocar por pérdida o robo",
          onPress: () => actions.revoke(item),
        }
      : undefined;
  }

  function emitAction(item: RegisterSummary): RegisterRowAction | undefined {
    return mayEnroll
      ? {
          icon: <KeySquare />,
          "aria-label": `Emitir código de alta para ${item.name}`,
          label: "Emitir código de alta",
          onPress: () => actions.emitCode(item),
        }
      : undefined;
  }

  function assignTerminalAction(item: RegisterSummary): RegisterRowAction | undefined {
    return mayAssignTerminal
      ? {
          icon: <CreditCard />,
          "aria-label": `Asignar terminal Point a ${item.name}`,
          label: "Asignar terminal Point",
          onPress: () => actions.assignTerminal(item),
        }
      : undefined;
  }

  function assignQrAction(item: RegisterSummary): RegisterRowAction | undefined {
    return mayAssignQr
      ? {
          icon: <QrCode />,
          "aria-label": `Asignar QR de Mercado Pago a ${item.name}`,
          label: "Asignar QR de Mercado Pago",
          onPress: () => actions.assignQr(item),
        }
      : undefined;
  }

  function visibleActions(item: RegisterSummary): RegisterRowAction[] {
    return [
      bitlockerKeyAction(item),
      revokeAction(item),
      emitAction(item),
      assignTerminalAction(item),
      assignQrAction(item),
    ].filter((action) => action !== undefined);
  }

  function inlineAction(index: number): TableAction<RegisterSummary> {
    return (item) => {
      const action = visibleActions(item)[index];
      return action === undefined
        ? undefined
        : { icon: action.icon, "aria-label": action["aria-label"], onPress: action.onPress };
    };
  }

  function menu(item: RegisterSummary): RowMenuActions | undefined {
    const [first, ...others] = visibleActions(item)
      .slice(INLINE_ACTIONS)
      .map(
        (action): RowMenuAction => ({
          label: action.label,
          icon: action.icon,
          onAction: action.onPress,
        }),
      );
    return first === undefined ? undefined : [first, ...others];
  }

  const grantedActions = [mayUseKey, mayRevoke, mayEnroll, mayAssignTerminal, mayAssignQr].filter(
    Boolean,
  ).length;
  if (grantedActions > INLINE_ACTIONS) {
    return { actions: [inlineAction(0), inlineAction(1), inlineAction(2)] as const, menu };
  }
  const inline: TableActions<RegisterSummary> =
    grantedActions <= 1
      ? [inlineAction(0)]
      : grantedActions === 2
        ? [inlineAction(0), inlineAction(1)]
        : [inlineAction(0), inlineAction(1), inlineAction(2)];
  return { actions: inline };
}
