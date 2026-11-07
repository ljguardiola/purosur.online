import { Button } from "@purosur/ui";
import { Ban, KeyRound, KeySquare, Upload } from "lucide-react";
import {
  type BackofficeAccess,
  canEnrollRegisters,
  canRevokeInstallations,
  canUseBitlockerRecoveryKey,
} from "../shell/backoffice-access";
import {
  InstallationStatusTag,
  RegisterInstallationSummary,
} from "./register-installation-summary";
import type { RegisterActions } from "./register-row-actions";
import type { RegisterSummary } from "./registers-api";

export type RegisterDataSectionProps = {
  register: RegisterSummary;
  access: BackofficeAccess;
  actions: RegisterActions;
  secondsSinceRead: number;
};

export function RegisterDataSection({
  register,
  access,
  actions,
  secondsSinceRead,
}: RegisterDataSectionProps) {
  const { installation } = register;
  const enrolled = installation?.state === "enrolled" ? installation : undefined;
  const keyHolder = canUseBitlockerRecoveryKey(access) ? enrolled : undefined;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          {installation === null ? null : (
            <span className="font-semibold text-body text-text">{installation.hostname}</span>
          )}
          <RegisterInstallationSummary register={register} secondsSinceRead={secondsSinceRead} />
        </div>
        <InstallationStatusTag installation={installation} />
      </div>
      {keyHolder !== undefined && (
        <p className="text-body text-text">
          {`Clave de BitLocker: ${keyHolder.bitlockerKeyLoaded ? "cargada" : "sin cargar"}`}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {canEnrollRegisters(access) && (
          <Button
            variant="secondary"
            size="small"
            icon={<KeySquare />}
            onPress={() => actions.emitCode(register)}
          >
            Emitir código de alta
          </Button>
        )}
        {keyHolder !== undefined &&
          (keyHolder.bitlockerKeyLoaded ? (
            <Button
              variant="secondary"
              size="small"
              icon={<KeyRound />}
              onPress={() => actions.consultKey(register)}
            >
              Consultar la clave de BitLocker
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="small"
              icon={<Upload />}
              onPress={() => actions.loadKey(register)}
            >
              Cargar la clave de BitLocker
            </Button>
          ))}
        {canRevokeInstallations(access) && enrolled !== undefined && (
          <Button
            variant="secondary"
            size="small"
            destructive
            icon={<Ban />}
            onPress={() => actions.revoke(register)}
          >
            Revocar
          </Button>
        )}
      </div>
    </div>
  );
}
