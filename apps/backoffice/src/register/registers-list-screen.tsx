import {
  actionsColumn,
  Button,
  ButtonLink,
  dataColumn,
  FloatingNotification,
  formatNumber,
  formatPointOfSaleNumber,
  plural,
  Table,
  TableCellText,
  useTableModel,
} from "@purosur/ui";
import { createLink, useNavigate } from "@tanstack/react-router";
import { Check, Laptop, Plus } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { cloudTableState } from "../platform/cloud-table-state";
import type { RegisterPointOfSaleSection } from "../platform/register-point-of-sale-section";
import {
  type BackofficeAccess,
  canEnrollRegisters,
  canRevokeInstallations,
} from "../shell/backoffice-access";
import { NewRegisterModal } from "./new-register-modal";
import { useRegisterActions } from "./register-action-modals";
import { RegisterCoverageNotice } from "./register-coverage-notice";
import {
  InstallationStatusTag,
  RegisterInstallationSummary,
  useSecondsSinceRead,
} from "./register-installation-summary";
import { RegisterPanel } from "./register-panel";
import {
  useRefreshRegisters,
  useRegisterCoverageQuery,
  useRegistersQuery,
} from "./register-queries";
import { registerRowActions } from "./register-row-actions";
import type { RegisterSummary } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";
import { RevokeEveryInstallationCallout } from "./revoke-every-installation-callout";
import { RevokeEveryInstallationModal } from "./revoke-every-installation-modal";

export type RegistersListScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: RegistersListScreenServices;
  registerPointOfSaleSection: RegisterPointOfSaleSection;
  openRegister?: string | undefined;
  tab?: string | undefined;
};

const RegisterRowLink = createLink(ButtonLink);

const NO_REGISTERS: RegisterSummary[] = [];

export function RegistersListScreen({
  access,
  onSessionEnded,
  services,
  registerPointOfSaleSection,
  openRegister,
  tab,
}: RegistersListScreenProps) {
  const navigate = useNavigate();
  const { fetchRegisters, fetchRegisterCoverage } = services;
  const data = useRegistersQuery({ fetchRegisters, onSessionEnded });
  const coverage = useRegisterCoverageQuery({ fetchRegisterCoverage, onSessionEnded });
  const refreshRegisters = useRefreshRegisters();
  const { actions, modals } = useRegisterActions({ services, onSessionEnded });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [revokeEveryOpen, setRevokeEveryOpen] = useState(false);
  const [revokedNotice, setRevokedNotice] = useState<{ id: number; registers: number } | null>(
    null,
  );
  const [revokedNoticeCount, setRevokedNoticeCount] = useState(0);
  const registers = data.status === "loaded" ? data.value : NO_REGISTERS;
  const secondsSinceRead = useSecondsSinceRead(registers);

  const openRegisterSummary = registers.find((register) => register.id === openRegister);
  const closeUnlistedRegister = useEffectEvent(() => {
    void navigate({
      from: "/registers",
      to: "/registers",
      search: (previous) => ({ ...previous, register: undefined, tab: undefined }),
      replace: true,
    });
  });
  useEffect(() => {
    if (
      data.status === "loaded" &&
      openRegister !== undefined &&
      openRegisterSummary === undefined
    ) {
      closeUnlistedRegister();
    }
  }, [data.status, openRegister, openRegisterSummary]);

  function closeRegister() {
    void navigate({
      from: "/registers",
      to: "/registers",
      search: (previous) => ({ ...previous, register: undefined, tab: undefined }),
    });
  }

  function openRegisterPanel(id: string) {
    void navigate({
      from: "/registers",
      to: "/registers",
      search: (previous) => ({ ...previous, register: id, tab: undefined }),
    });
  }

  const mayEnroll = canEnrollRegisters(access);
  const mayRevoke = canRevokeInstallations(access);
  const rowActions = registerRowActions(access, actions);

  const columns = [
    dataColumn({
      id: "register",
      header: "Caja",
      render: (item: RegisterSummary) => (
        <TableCellText
          description={
            item.installation?.state === "enrolled" ? item.installation.hostname : "Sin instalación"
          }
        >
          <RegisterRowLink
            from="/registers"
            to="/registers"
            search={(previous) => ({ ...previous, register: item.id, tab: undefined })}
            variant="text"
          >
            {item.name}
          </RegisterRowLink>
        </TableCellText>
      ),
    }),
    dataColumn({
      id: "installation",
      header: "Instalación",
      render: (item: RegisterSummary) => (
        <RegisterInstallationSummary register={item} secondsSinceRead={secondsSinceRead} />
      ),
    }),
    dataColumn({
      id: "pointsOfSale",
      header: "Punto de venta",
      render: (item: RegisterSummary) =>
        item.pointOfSaleNumber === null ? (
          <span className="text-text-subtle text-detail">Sin configurar</span>
        ) : (
          <span className="text-text text-detail">
            {formatPointOfSaleNumber(item.pointOfSaleNumber)}
          </span>
        ),
    }),
    dataColumn({
      id: "pointTerminal",
      header: "Terminal Point",
      render: (item: RegisterSummary) =>
        item.pointTerminalId === null ? (
          <span className="text-text-subtle text-detail">Sin asignar</span>
        ) : (
          <span className="text-text text-detail">{item.pointTerminalId}</span>
        ),
    }),
    dataColumn({
      id: "qrPointOfSale",
      header: "QR de Mercado Pago",
      render: (item: RegisterSummary) =>
        item.qrExternalPosId === null ? (
          <span className="text-text-subtle text-detail">Sin asignar</span>
        ) : (
          <span className="text-text text-detail">{item.qrExternalPosId}</span>
        ),
    }),
    dataColumn({
      id: "status",
      header: "Estado",
      render: (item: RegisterSummary) => <InstallationStatusTag installation={item.installation} />,
    }),
    actionsColumn({
      id: "actions",
      header: "Acciones",
      ...rowActions,
    }),
  ] as const;

  const table = useTableModel({
    items: registers,
    id: (register) => register.id,
    columns,
  });

  return (
    <>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          {mayEnroll && (
            <div className="flex justify-end">
              <Button variant="primary" icon={<Plus />} onPress={() => setNewModalOpen(true)}>
                Nueva caja
              </Button>
            </div>
          )}
          <Table
            aria-label="Cajas registradoras"
            table={table}
            onRowPress={(item) => openRegisterPanel(item.id)}
            rowState={(item) => (item.id === openRegister ? "selected" : undefined)}
            {...cloudTableState(data, "las cajas registradoras")}
            empty={{
              icon: <Laptop />,
              title: "Todavía no hay cajas registradoras",
              description: "Creá la primera para verla en la lista.",
              variant: "blank",
            }}
            footer={
              registers.length === 0 ? undefined : (
                <p className="text-text-subtle text-detail">
                  {plural(registers.length, {
                    one: "1 caja",
                    other: `${formatNumber(registers.length)} cajas`,
                  })}
                </p>
              )
            }
          />
          {mayRevoke && (
            <RevokeEveryInstallationCallout onRevoke={() => setRevokeEveryOpen(true)} />
          )}
          <RegisterCoverageNotice coverage={coverage} />
        </div>
        {openRegisterSummary === undefined ? null : (
          <RegisterPanel
            key={openRegisterSummary.id}
            register={openRegisterSummary}
            access={access}
            actions={actions}
            secondsSinceRead={secondsSinceRead}
            tab={tab}
            onClose={closeRegister}
            onSessionEnded={onSessionEnded}
            services={services}
            registerPointOfSaleSection={registerPointOfSaleSection}
          />
        )}
      </div>
      <NewRegisterModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={() => {
          setNewModalOpen(false);
          void refreshRegisters();
        }}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <RevokeEveryInstallationModal
        open={revokeEveryOpen}
        onClose={() => setRevokeEveryOpen(false)}
        onRevoked={({ revokedRegisters }) => {
          void refreshRegisters();
          setRevokedNotice({ id: revokedNoticeCount, registers: revokedRegisters });
          setRevokedNoticeCount(revokedNoticeCount + 1);
        }}
        onOutdated={() => void refreshRegisters()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      {revokedNotice === null ? null : (
        <FloatingNotification
          key={revokedNotice.id}
          tone="success"
          icon={<Check />}
          title="Instalaciones revocadas"
          description={plural(revokedNotice.registers, {
            one: "Se revocó 1 caja.",
            other: `Se revocaron ${formatNumber(revokedNotice.registers)} cajas.`,
          })}
          onDismiss={() => setRevokedNotice(null)}
        />
      )}
      {modals}
    </>
  );
}
