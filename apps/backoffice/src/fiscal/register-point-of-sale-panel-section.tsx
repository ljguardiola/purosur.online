import {
  Button,
  EmptyState,
  FloatingNotification,
  formatPointOfSaleNumber,
  LoadFailure,
  LoadingPlaceholder,
} from "@purosur/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import { Check, Landmark, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { combineCloudData } from "../platform/combine-cloud-data";
import type { RegisterPointOfSaleSectionProps } from "../platform/register-point-of-sale-section";
import {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  EditRegisterOfflinePointOfSaleModal,
  type EditRegisterOfflinePointOfSaleModalServices,
} from "./edit-register-offline-point-of-sale-modal";
import {
  EditRegisterPointOfSaleModal,
  type EditRegisterPointOfSaleModalServices,
} from "./edit-register-point-of-sale-modal";
import { createFiscalAddress, fetchFiscalAddresses } from "./fiscal-addresses-api";
import { DataPair } from "./fiscal-data-pair";
import {
  useFiscalAddressesQuery,
  useRegisterPointsOfSaleQuery,
  useReloadFiscalAddresses,
  useReloadRegisterPointsOfSale,
} from "./fiscal-queries";
import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
  fetchRegisterPointsOfSale,
} from "./register-points-of-sale-api";

export type RegisterPointOfSalePanelSectionServices = EditRegisterPointOfSaleModalServices &
  EditRegisterOfflinePointOfSaleModalServices & {
    fetchRegisterPointsOfSale: typeof fetchRegisterPointsOfSale;
    fetchFiscalAddresses: typeof fetchFiscalAddresses;
  };

const defaultServices: RegisterPointOfSalePanelSectionServices = {
  fetchRegisterPointsOfSale,
  fetchFiscalAddresses,
  configureRegisterPointOfSale,
  configureRegisterOfflinePointOfSale,
  createFiscalAddress,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

type RegisterPointOfSalePanelSectionProps = RegisterPointOfSaleSectionProps & {
  services?: RegisterPointOfSalePanelSectionServices | undefined;
};

type Notice = { id: number; title: string; description: string };

const MISSING = "Sin configurar";

export function RegisterPointOfSalePanelSection({
  registerId,
  onSessionEnded,
  services = defaultServices,
}: RegisterPointOfSalePanelSectionProps) {
  const { fetchRegisterPointsOfSale: fetchRegisters, fetchFiscalAddresses: fetchAddresses } =
    services;
  const registers = useRegisterPointsOfSaleQuery({
    fetchRegisterPointsOfSale: fetchRegisters,
    onSessionEnded,
  });
  const fiscalAddresses = useFiscalAddressesQuery({
    fetchFiscalAddresses: fetchAddresses,
    onSessionEnded,
  });
  const reloadRegisters = useReloadRegisterPointsOfSale({
    fetchRegisterPointsOfSale: fetchRegisters,
  });
  const reloadFiscalAddresses = useReloadFiscalAddresses({ fetchFiscalAddresses: fetchAddresses });
  const [editing, setEditing] = useState<"real_time" | "offline" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const lastNoticeId = useRef(0);

  function announce(title: string, description: string) {
    lastNoticeId.current += 1;
    setNotice({ id: lastNoticeId.current, title, description });
  }

  const data = combineCloudData(registers, fiscalAddresses);
  if (data.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={2} />;
  }
  if (data.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(data, "el punto de venta")} />;
  }
  const [allRegisters, addresses] = data.value;
  const register = allRegisters.find((candidate) => candidate.registerId === registerId);
  if (register === undefined) {
    return (
      <EmptyState
        icon={<Landmark />}
        title="No encontramos el punto de venta de esta caja"
        variant="blank"
      />
    );
  }
  const fiscalAddress = addresses.find(({ id }) => id === register.fiscalAddressId);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex gap-8">
          <DataPair
            label="Punto de venta"
            value={
              register.pointOfSaleNumber === null
                ? null
                : formatPointOfSaleNumber(register.pointOfSaleNumber)
            }
            missing={MISSING}
          />
          <DataPair
            label="Domicilio fiscal"
            value={fiscalAddress?.name ?? null}
            missing={MISSING}
          />
          <DataPair
            label="Punto de venta CAEA"
            value={
              register.offlinePointOfSaleNumber === null
                ? null
                : formatPointOfSaleNumber(register.offlinePointOfSaleNumber)
            }
            missing={MISSING}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="small"
            icon={<Pencil />}
            dataStatus={data.status}
            onPress={() => setEditing("real_time")}
          >
            Editar
          </Button>
          <Button
            variant="secondary"
            size="small"
            icon={<Pencil />}
            dataStatus={data.status}
            onPress={() => setEditing("offline")}
          >
            Editar CAEA
          </Button>
        </div>
      </div>
      <EditRegisterPointOfSaleModal
        target={editing === "real_time" ? register : null}
        fiscalAddresses={addresses}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          announce("Punto de venta guardado", `${register.registerName}.`);
        }}
        reload={reloadRegisters}
        refreshFiscalAddresses={reloadFiscalAddresses}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <EditRegisterOfflinePointOfSaleModal
        target={editing === "offline" ? register : null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          announce("Punto de venta CAEA guardado", `${register.registerName}.`);
        }}
        reload={reloadRegisters}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      {notice ? (
        <FloatingNotification
          key={notice.id}
          tone="success"
          icon={<Check />}
          title={notice.title}
          description={notice.description}
          onDismiss={() => setNotice(null)}
        />
      ) : null}
    </>
  );
}
