import { Button, EmptyState, IconButton, LoadFailure, LoadingPlaceholder } from "@purosur/ui";
import { KeyRound, Laptop, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { useOwnPasskeysQuery, useRefreshAccess } from "./access-queries";
import type { MyAccountScreenServices } from "./my-account-services";
import type { Passkey } from "./passkey-api";
import { passkeyRowDetail } from "./passkey-row-detail";
import { RegisterOwnPasskeyModal } from "./register-own-passkey-modal";
import { RemoveOwnPasskeyModal } from "./remove-own-passkey-modal";

export type MyAccountScreenProps = {
  displayName: string;
  onSessionEnded: () => void;
  now?: () => Date;
  services: MyAccountScreenServices;
};

const NO_PASSKEYS: Passkey[] = [];

export function MyAccountScreen({
  displayName,
  onSessionEnded,
  now,
  services,
}: MyAccountScreenProps) {
  const { fetchPasskeys } = services;
  const data = useOwnPasskeysQuery({
    fetchPasskeys,
    now: now ?? (() => new Date()),
    onSessionEnded,
  });
  const refreshAccess = useRefreshAccess();
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Passkey | null>(null);

  const passkeys = data.status === "loaded" ? data.value.passkeys : NO_PASSKEYS;
  const isOnlyPasskey = passkeys.length === 1;
  const hasNoPasskeys = data.status === "loaded" && passkeys.length === 0;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 flex-col justify-center border-border border-b bg-surface px-8">
            <p className="text-text-subtle text-detail">{`Configuración · ${displayName}`}</p>
            <ScreenTitle>Mi cuenta</ScreenTitle>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 text-subheading text-text-accent">Passkeys</h2>
            <Button
              variant="secondary"
              icon={<Plus />}
              dataStatus={data.status}
              disabled={hasNoPasskeys}
              onPress={() => setRegisterModalOpen(true)}
            >
              Registrar otra passkey
            </Button>
          </div>
          {data.status === "loading" && <LoadingPlaceholder variant="list" items={2} />}
          {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "tus passkeys")} />}
          {data.status === "loaded" &&
            (hasNoPasskeys ? (
              <EmptyState
                icon={<KeyRound />}
                title="No tenés ninguna passkey"
                description="Para volver a entrar al backoffice vas a tener que pedir el enlace de recuperación por correo."
                variant="blank"
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {passkeys.map((passkey) => (
                  <li key={passkey.id} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-icon-lg shrink-0 text-text-subtle"
                    >
                      <Laptop />
                    </span>
                    <div className="flex flex-1 flex-col gap-1">
                      <p className="font-semibold text-body text-text">{passkey.name}</p>
                      <p className="text-text-subtle text-detail">
                        {passkeyRowDetail(passkey, data.value.loadedAt)}
                      </p>
                    </div>
                    <IconButton
                      icon={<Trash2 />}
                      aria-label={`Dar de baja la passkey «${passkey.name}»`}
                      onPress={() => setRemoveTarget(passkey)}
                    />
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </ScreenLayout>
      <RegisterOwnPasskeyModal
        open={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        onRegistered={() => {
          setRegisterModalOpen(false);
          void refreshAccess();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <RemoveOwnPasskeyModal
        target={removeTarget}
        isOnlyPasskey={isOnlyPasskey}
        onClose={() => setRemoveTarget(null)}
        onRemoved={() => {
          setRemoveTarget(null);
          void refreshAccess();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
    </>
  );
}
