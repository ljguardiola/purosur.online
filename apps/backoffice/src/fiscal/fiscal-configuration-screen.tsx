import { useState } from "react";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { EditIssuerIdentificationModal } from "./edit-issuer-identification-modal";
import type { FiscalConfigurationScreenServices } from "./fiscal-configuration-services";
import { useIssuerIdentificationQuery, useReloadIssuerIdentification } from "./fiscal-queries";
import { IssuerIdentificationSection } from "./issuer-identification-section";

export type FiscalConfigurationScreenProps = {
  onSessionEnded: () => void;
  services: FiscalConfigurationScreenServices;
  now?: () => Date;
};

export function FiscalConfigurationScreen({
  onSessionEnded,
  services,
  now,
}: FiscalConfigurationScreenProps) {
  const { fetchIssuerIdentification } = services;
  const clock = now ?? (() => new Date());
  const data = useIssuerIdentificationQuery({ fetchIssuerIdentification, onSessionEnded });
  const reload = useReloadIssuerIdentification({ fetchIssuerIdentification });
  const [editing, setEditing] = useState(false);
  if (editing && data.status === "failed") {
    setEditing(false);
  }

  const issuerIdentification = data.status === "loaded" ? data.value : null;

  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center border-border border-b bg-surface px-8">
          <div className="flex flex-col justify-center">
            <p className="text-text-subtle text-detail">Caja y fiscal · Fiscal</p>
            <ScreenTitle>Configuración fiscal</ScreenTitle>
          </div>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      <IssuerIdentificationSection data={data} onEdit={() => setEditing(true)} />
      <EditIssuerIdentificationModal
        target={editing ? issuerIdentification : null}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
        reload={reload}
        onSessionEnded={onSessionEnded}
        services={services}
        now={clock}
      />
    </ScreenLayout>
  );
}
