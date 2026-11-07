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
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import { cloudTableState } from "../platform/cloud-table-state";
import type { RegisterPointOfSaleSection } from "../platform/register-point-of-sale-section";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type BackofficeAccess,
  canEnrollRegisters,
  canRevokeInstallations,
} from "../shell/backoffice-access";
import type { ReportPeriodFilters } from "../shell/report-filters-search";
import { AssignPointTerminalModal } from "./assign-point-terminal-modal";
import { AssignQrPointOfSaleModal } from "./assign-qr-point-of-sale-modal";
import { ConsultBitlockerRecoveryKeyModal } from "./consult-bitlocker-recovery-key-modal";
import { type EmissionState, EnrollmentCodeModal } from "./enrollment-code-modal";
import { LoadBitlockerRecoveryKeyModal } from "./load-bitlocker-recovery-key-modal";
import { NewRegisterModal } from "./new-register-modal";
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
  useReloadRegister,
} from "./register-queries";
import { type RegisterActions, registerRowActions } from "./register-row-actions";
import type { EmitEnrollmentCodeOutcome, RegisterSummary } from "./registers-api";
import type { RegistersListScreenServices } from "./registers-list-services";
import { RevokeEveryInstallationCallout } from "./revoke-every-installation-callout";
import { RevokeEveryInstallationModal } from "./revoke-every-installation-modal";
import { RevokeRegisterModal } from "./revoke-register-modal";

export type RegistersListScreenProps = {
  access: BackofficeAccess;
  onSessionEnded: () => void;
  services: RegistersListScreenServices;
  registerPointOfSaleSection: RegisterPointOfSaleSection;
  openRegister?: string | undefined;
  tab?: string | undefined;
  sessionsPeriod: ReportPeriodFilters;
  onSessionsPeriodChange: (period: ReportPeriodFilters) => void;
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
  sessionsPeriod,
  onSessionsPeriodChange,
}: RegistersListScreenProps) {
  const navigate = useNavigate();
  const sendToMyAccount = useSendToMyAccount();
  const {
    fetchRegisters,
    fetchRegisterCoverage,
    emitEnrollmentCode,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const data = useRegistersQuery({ fetchRegisters, onSessionEnded });
  const coverage = useRegisterCoverageQuery({ fetchRegisterCoverage, onSessionEnded });
  const refreshRegisters = useRefreshRegisters();
  const reloadRegister = useReloadRegister({ fetchRegisters });
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [terminalTarget, setTerminalTarget] = useState<RegisterSummary | null>(null);
  const [qrTarget, setQrTarget] = useState<RegisterSummary | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RegisterSummary | null>(null);
  const [loadKeyTarget, setLoadKeyTarget] = useState<RegisterSummary | null>(null);
  const [consultKeyTarget, setConsultKeyTarget] = useState<RegisterSummary | null>(null);
  const [revokeEveryOpen, setRevokeEveryOpen] = useState(false);
  const [revokedNotice, setRevokedNotice] = useState<{ id: number; registers: number } | null>(
    null,
  );
  const [revokedNoticeCount, setRevokedNoticeCount] = useState(0);
  const [emission, setEmission] = useState<EmissionState>({ kind: "closed" });
  const { run: runEmission, modal: emissionAuthModal } =
    useAuthorization<EmitEnrollmentCodeOutcome>({
      actionName: "Emitir un código de alta",
      onSessionEnded,
      services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
    });
  const latestEmission = useRef(0);

  // Guards a second Enter/Space activation before the first request settles (the modal backdrop
  // blocks other rows).
  async function handleEmitClick(register: RegisterSummary) {
    if (emission.kind === "issuing") {
      return;
    }
    latestEmission.current += 1;
    const thisEmission = latestEmission.current;
    setEmission({ kind: "issuing", register });

    const outcome = await runEmission(() => emitEnrollmentCode(register.id));
    if (thisEmission !== latestEmission.current) {
      return;
    }
    // The attempt always reaches the server before "cancelled" can resolve (only
    // `authorization_required` opens the modal that cancel dismisses), so reload every time.
    if (outcome.kind === "cancelled") {
      setEmission({ kind: "closed" });
      void refreshRegisters();
      return;
    }
    if (outcome.kind === "ok") {
      setEmission({ kind: "issued", register, code: outcome.value.code });
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "not_found") {
      setEmission({ kind: "closed" });
      void refreshRegisters();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setEmission({ kind: "rateLimited", register, retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setEmission({ kind: "attemptFailed", register });
  }

  // Reloads after every outcome, not just an issued code: a failure seen here (a dropped
  // connection, an unreadable 200) may still follow a code the cloud already committed.
  function closeEmission() {
    latestEmission.current += 1;
    setEmission({ kind: "closed" });
    void refreshRegisters();
  }

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
  const actions: RegisterActions = {
    emitCode: (register) => void handleEmitClick(register),
    revoke: setRevokeTarget,
    loadKey: setLoadKeyTarget,
    consultKey: setConsultKeyTarget,
    assignTerminal: setTerminalTarget,
    assignQr: setQrTarget,
  };
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
            sessionsPeriod={sessionsPeriod}
            onSessionsPeriodChange={onSessionsPeriodChange}
            onClose={closeRegister}
            onPointOfSaleSaved={() => void refreshRegisters()}
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
      <AssignPointTerminalModal
        target={terminalTarget}
        onClose={() => setTerminalTarget(null)}
        onSaved={() => {
          setTerminalTarget(null);
          void refreshRegisters();
        }}
        reload={reloadRegister}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <AssignQrPointOfSaleModal
        target={qrTarget}
        onClose={() => setQrTarget(null)}
        onSaved={() => {
          setQrTarget(null);
          void refreshRegisters();
        }}
        reload={reloadRegister}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <EnrollmentCodeModal
        emission={emission}
        onClose={closeEmission}
        onDone={closeEmission}
        onRetry={(register) => void handleEmitClick(register)}
      />
      <RevokeRegisterModal
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onRevoked={() => void refreshRegisters()}
        onOutdated={() => void refreshRegisters()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <LoadBitlockerRecoveryKeyModal
        target={loadKeyTarget}
        onClose={() => setLoadKeyTarget(null)}
        onLoaded={() => void refreshRegisters()}
        onOutdated={() => void refreshRegisters()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      <ConsultBitlockerRecoveryKeyModal
        target={consultKeyTarget}
        onClose={() => setConsultKeyTarget(null)}
        onOutdated={() => void refreshRegisters()}
        onSessionEnded={onSessionEnded}
        services={services}
      />
      {emissionAuthModal}
    </>
  );
}
