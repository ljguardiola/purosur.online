import { Button, FloatingNotification } from "@purosur/ui";
import { Check, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { combineCloudData } from "../platform/combine-cloud-data";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import { EditFiscalAddressModal } from "./edit-fiscal-address-modal";
import { EditRegisterPointOfSaleModal } from "./edit-register-point-of-sale-modal";
import { FiscalAddressesSection } from "./fiscal-addresses-section";
import {
  useFiscalAddressesQuery,
  useRegisterPointsOfSaleQuery,
  useReloadFiscalAddresses,
  useReloadRegisterPointsOfSale,
} from "./fiscal-queries";
import { NewFiscalAddressModal } from "./new-fiscal-address-modal";
import type { PointsOfSaleScreenServices } from "./points-of-sale-services";
import { RegisterPointOfSaleSection } from "./register-point-of-sale-section";

export type PointsOfSaleScreenProps = {
  onSessionEnded: () => void;
  services: PointsOfSaleScreenServices;
};

type ScreenNotice = { id: number; title: string; description: string };

export function PointsOfSaleScreen({ onSessionEnded, services }: PointsOfSaleScreenProps) {
  const { fetchRegisterPointsOfSale, fetchFiscalAddresses } = services;
  const registers = useRegisterPointsOfSaleQuery({ fetchRegisterPointsOfSale, onSessionEnded });
  const fiscalAddresses = useFiscalAddressesQuery({ fetchFiscalAddresses, onSessionEnded });
  const reloadRegisters = useReloadRegisterPointsOfSale({ fetchRegisterPointsOfSale });
  const reloadFiscalAddresses = useReloadFiscalAddresses({ fetchFiscalAddresses });
  const [editingRegisterId, setEditingRegisterId] = useState<string | null>(null);
  const [editingFiscalAddressId, setEditingFiscalAddressId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);
  const lastNoticeId = useRef(0);

  function announce(title: string, description: string) {
    lastNoticeId.current += 1;
    setNotice({ id: lastNoticeId.current, title, description });
  }

  const registersWithAddresses = combineCloudData(registers, fiscalAddresses);
  const loadedRegisters = registers.status === "loaded" ? registers.value : [];
  const loadedFiscalAddresses = fiscalAddresses.status === "loaded" ? fiscalAddresses.value : [];
  const editingRegister =
    loadedRegisters.find(({ registerId }) => registerId === editingRegisterId) ?? null;
  const editingFiscalAddress =
    loadedFiscalAddresses.find(({ id }) => id === editingFiscalAddressId) ?? null;

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Caja y fiscal · Fiscal</p>
              <ScreenTitle>Puntos de venta</ScreenTitle>
            </div>
            <Button variant="primary" icon={<Plus />} onPress={() => setCreating(true)}>
              Nuevo domicilio fiscal
            </Button>
          </div>
        }
        bodyClassName="gap-4 p-6"
      >
        <RegisterPointOfSaleSection
          data={registersWithAddresses}
          onEdit={({ registerId }) => setEditingRegisterId(registerId)}
        />
        <FiscalAddressesSection
          data={fiscalAddresses}
          onEdit={({ id }) => setEditingFiscalAddressId(id)}
        />
      </ScreenLayout>
      <EditRegisterPointOfSaleModal
        target={editingRegister}
        fiscalAddresses={loadedFiscalAddresses}
        onClose={() => setEditingRegisterId(null)}
        onSaved={() => {
          setEditingRegisterId(null);
          announce("Punto de venta guardado", `${editingRegister?.registerName ?? ""}.`);
        }}
        reload={reloadRegisters}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <NewFiscalAddressModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setCreating(false);
          void reloadFiscalAddresses();
          announce("Domicilio fiscal creado", `${name}.`);
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <EditFiscalAddressModal
        target={editingFiscalAddress}
        onClose={() => setEditingFiscalAddressId(null)}
        onSaved={(name) => {
          setEditingFiscalAddressId(null);
          announce("Domicilio fiscal guardado", `${name}.`);
        }}
        reload={reloadFiscalAddresses}
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
